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

async function fetchICS(config: CalendarConfig, rangeStart: Date, rangeEnd: Date): Promise<CalendarEvent[]> {
  try {
    const response = await fetch(config.url, {
      next: { revalidate: 300 }, // Cache for 5 minutes
    } as any);

    if (!response.ok) {
      console.error(`Failed to fetch ${config.name}: ${response.status}`);
      return [];
    }

    const icsData = await response.text();
    const jcalData = ICAL.parse(icsData);
    const comp = new ICAL.Component(jcalData);
    const params: CalendarEvent[] = [];

    // Group events by UID to handle overrides
    const eventsByUid = new Map<string, ICAL.Component[]>();
    const vevents = comp.getAllSubcomponents('vevent');

    for (const vevent of vevents) {
      const uid = vevent.getFirstPropertyValue('uid');
      if (!eventsByUid.has(uid)) {
        eventsByUid.set(uid, []);
      }
      eventsByUid.get(uid)?.push(vevent);
    }

    for (const [uid, components] of eventsByUid) {
      // Find master event (no recurrence-id)
      const masterComp = components.find(c => !c.getFirstPropertyValue('recurrence-id'));
      const exceptions = components.filter(c => c.getFirstPropertyValue('recurrence-id'));

      // Helper to process a single event instance
      const processEvent = (event: ICAL.Event, start: Date, end: Date) => {
        // Skip cancelled
        if (event.summary && event.summary.includes('Canceled:')) return;
        const status = event.component.getFirstPropertyValue('status');
        if (status === 'CANCELLED') return;

        // Check if fully outside range
        if (end < rangeStart || start > rangeEnd) return;

        params.push({
          id: `${config.name}-${event.uid}-${start.getTime()}`,
          title: event.summary || 'Untitled',
          start: start.toISOString(),
          end: end.toISOString(),
          allDay: event.startDate.isDate,
          calendar: config.name,
          color: config.color,
          location: event.location || undefined,
          description: event.description || undefined,
        });
      };

      // 1. Process Master Event (Expansion)
      if (masterComp) {
        const masterEvent = new ICAL.Event(masterComp);

        // Skip master if cancelled
        if (masterEvent.component.getFirstPropertyValue('status') === 'CANCELLED') {
          // If master is cancelled, do we skip overrides? usually yes, but let's be safe.
          // Actually if master is cancelled, the whole series is usually dead.
        } else if (masterEvent.isRecurring()) {
          const iterator = masterEvent.iterator();
          let next;
          let count = 0;
          const maxOccurrences = 500;

          // Track exception dates (recurrence-ids) to skip them in expansion
          const exceptionDates = new Set<number>();
          for (const ex of exceptions) {
            const rid = ex.getFirstPropertyValue('recurrence-id');
            if (rid) exceptionDates.add(rid.toJSDate().getTime());
          }

          while ((next = iterator.next()) && count < maxOccurrences) {
            const start = next.toJSDate();

            // If this date is covered by an exception (override), skip it here
            // (The exception will be processed separately or is a cancellation)
            if (exceptionDates.has(start.getTime())) {
              continue;
            }

            if (start > rangeEnd) break;

            const duration = masterEvent.duration;
            const end = new Date(start.getTime() + (duration ? duration.toSeconds() * 1000 : 0));

            if (end < rangeStart) continue;

            processEvent(masterEvent, start, end); // Use shared helper but careful with overrides
            count++;
          }
        } else {
          // Master is not recurring
          const start = masterEvent.startDate.toJSDate();
          const duration = masterEvent.duration;
          const end = masterEvent.endDate ? masterEvent.endDate.toJSDate() :
            new Date(start.getTime() + (duration ? duration.toSeconds() * 1000 : 0));
          processEvent(masterEvent, start, end);
        }
      }

      // 2. Process Exceptions (Overrides) independently
      // These are specific instances (moves) or single separate events
      for (const exComp of exceptions) {
        const exEvent = new ICAL.Event(exComp);
        // Recurrence-ID exists, meaning it replaces a specific instance.
        // We already skipped the "original" time in the master loop above.
        // Now just add this event as is (if not cancelled).

        const start = exEvent.startDate.toJSDate();
        const duration = exEvent.duration;
        const end = exEvent.endDate ? exEvent.endDate.toJSDate() :
          new Date(start.getTime() + (duration ? duration.toSeconds() * 1000 : 0));

        processEvent(exEvent, start, end);
      }
    }

    return params;
  } catch (error) {
    console.error(`Error fetching ${config.name}:`, error);
    return [];
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  // Define strict expansion window based on request
  // Default to [Now - 1 month, Now + 6 months] if not provided
  const rangeStart = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rangeEnd = to ? new Date(to) : new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);

  // Security check
  const apiSecret = process.env.API_SECRET;
  const apiKey = request.headers.get('x-api-key');

  if (apiSecret && apiKey !== apiSecret) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    // Fetch all calendars in parallel, passing the range constraints
    const allEventsArrays = await Promise.all(
      calendars.map(config => fetchICS(config, rangeStart, rangeEnd))
    );

    let events = allEventsArrays.flat();

    // Final filter to be absolutely safe (redundant but cheap)
    events = events.filter((event) => {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);
      return eventStart < rangeEnd && eventEnd > rangeStart;
    });

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
