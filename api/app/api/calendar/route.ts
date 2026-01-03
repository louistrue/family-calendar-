import { NextResponse } from 'next/server';
import ICAL from 'ical.js';

interface CalendarConfig {
  url: string;
  name: string;
  color: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  calendar: string;
  color: string;
  location?: string;
  description?: string;
}

const calendars: CalendarConfig[] = [
  {
    url: process.env.CAL_1_URL || '',
    name: process.env.CAL_1_NAME || 'Calendar 1',
    color: process.env.CAL_1_COLOR || '#3B82F6',
  },
  {
    url: process.env.CAL_2_URL || '',
    name: process.env.CAL_2_NAME || 'Calendar 2',
    color: process.env.CAL_2_COLOR || '#22C55E',
  },
  {
    url: process.env.CAL_3_URL || '',
    name: process.env.CAL_3_NAME || 'Calendar 3',
    color: process.env.CAL_3_COLOR || '#EC4899',
  },
  {
    url: process.env.CAL_4_URL || '',
    name: process.env.CAL_4_NAME || 'Calendar 4',
    color: process.env.CAL_4_COLOR || '#F97316',
  },
].filter((cal) => cal.url);

async function fetchICS(config: CalendarConfig): Promise<CalendarEvent[]> {
  try {
    const response = await fetch(config.url, {
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${config.name}: ${response.status}`);
      return [];
    }

    const icsData = await response.text();
    const jcalData = ICAL.parse(icsData);
    const comp = new ICAL.Component(jcalData);
    const events: CalendarEvent[] = [];

    const vevents = comp.getAllSubcomponents('vevent');

    for (const vevent of vevents) {
      const event = new ICAL.Event(vevent);

      // Handle recurring events
      if (event.isRecurring()) {
        const start = new Date();
        start.setMonth(start.getMonth() - 1);
        const end = new Date();
        end.setMonth(end.getMonth() + 3);

        const iterator = event.iterator();
        let next;
        let count = 0;
        const maxOccurrences = 100;

        while ((next = iterator.next()) && count < maxOccurrences) {
          const occurrenceStart = next.toJSDate();

          if (occurrenceStart > end) break;
          if (occurrenceStart < start) continue;

          const duration = event.duration;
          const occurrenceEnd = new Date(
            occurrenceStart.getTime() + duration.toSeconds() * 1000
          );

          events.push({
            id: `${event.uid}-${occurrenceStart.toISOString()}`,
            title: event.summary || 'Untitled',
            start: occurrenceStart.toISOString(),
            end: occurrenceEnd.toISOString(),
            allDay: event.startDate.isDate,
            calendar: config.name,
            color: config.color,
            location: event.location || undefined,
            description: event.description || undefined,
          });

          count++;
        }
      } else {
        // Non-recurring event
        const startDate = event.startDate?.toJSDate();
        const endDate = event.endDate?.toJSDate();

        if (startDate) {
          events.push({
            id: event.uid,
            title: event.summary || 'Untitled',
            start: startDate.toISOString(),
            end: endDate?.toISOString() || startDate.toISOString(),
            allDay: event.startDate.isDate,
            calendar: config.name,
            color: config.color,
            location: event.location || undefined,
            description: event.description || undefined,
          });
        }
      }
    }

    return events;
  } catch (error) {
    console.error(`Error fetching ${config.name}:`, error);
    return [];
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  try {
    // Fetch all calendars in parallel
    const allEventsArrays = await Promise.all(calendars.map(fetchICS));
    let events = allEventsArrays.flat();

    // Filter by date range if provided
    if (from && to) {
      const fromDate = new Date(from);
      const toDate = new Date(to);

      events = events.filter((event) => {
        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);
        return eventStart <= toDate && eventEnd >= fromDate;
      });
    }

    // Sort by start time
    events.sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
    );

    // Return calendar metadata along with events
    const response = {
      calendars: calendars.map((cal) => ({
        name: cal.name,
        color: cal.color,
      })),
      events,
      fetchedAt: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Calendar API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch calendars' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
