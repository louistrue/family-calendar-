'use client';

import { useState, useEffect } from 'react';

// Constants matching ESP32
const SCREEN_WIDTH = 1024;
const SCREEN_HEIGHT = 600;
const COLOR_BG = '#101020'; // 0x1084 roughly
const COLOR_HEADER = '#202020'; // 0x2104 roughly
const COLOR_TODAY = '#404040'; // 0x4208 roughly
const COLOR_TEXT = '#FFFFFF';
const COLOR_TEXT_DIM = '#808080';
const COLOR_GRID = '#303040';
const COLOR_NOW = '#FF0000';

interface CalendarEvent {
    id: string;
    title: string;
    start: string;
    end: string;
    allDay: boolean;
    calendar: string;
    color: string;
}

interface CalendarInfo {
    name: string;
    color: string;
}

export default function Simulator() {
    const [apiKey, setApiKey] = useState('');
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [calendars, setCalendars] = useState<CalendarInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Simulator state
    const [view, setView] = useState<'DAY' | 'WEEK' | 'MONTH'>('WEEK');
    const [date, setDate] = useState(new Date());

    const fetchEvents = async () => {
        setLoading(true);
        setError('');
        try {
            const start = new Date(date);
            start.setMonth(start.getMonth() - 1);
            const end = new Date(date);
            end.setMonth(end.getMonth() + 2);

            const res = await fetch(
                `/api/calendar?from=${start.toISOString()}&to=${end.toISOString()}`,
                {
                    headers: {
                        'x-api-key': apiKey,
                    },
                }
            );

            if (!res.ok) {
                throw new Error(res.status === 401 ? 'Unauthorized' : 'Failed to fetch');
            }

            const data = await res.json();
            setEvents(data.events);
            setCalendars(data.calendars);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const navigate = (dir: -1 | 1) => {
        const newDate = new Date(date);
        if (view === 'MONTH') {
            newDate.setMonth(newDate.getMonth() + dir);
        } else if (view === 'WEEK') {
            newDate.setDate(newDate.getDate() + dir * 7);
        } else {
            newDate.setDate(newDate.getDate() + dir);
        }
        setDate(newDate);
    };

    const getDayEvents = (d: Date) => {
        return events.filter((e) => {
            const start = new Date(e.start);
            const end = new Date(e.end);
            // Simple overlap check for the day
            const dayStart = new Date(d);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(d);
            dayEnd.setHours(23, 59, 59, 999);

            return start < dayEnd && end > dayStart;
        });
    };

    return (
        <div style={{ minHeight: '100vh', padding: '20px', background: '#000' }}>
            <div style={{ marginBottom: '20px', color: '#fff' }}>
                <h1>Device Simulator</h1>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                        type="text"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="Enter API Key"
                        style={{ padding: '5px' }}
                    />
                    <button onClick={fetchEvents} disabled={loading}>
                        {loading ? 'Loading...' : 'Load Data'}
                    </button>
                </div>
                {error && <div style={{ color: 'red', marginTop: '10px' }}>{error}</div>}
            </div>

            <div
                style={{
                    width: SCREEN_WIDTH,
                    height: SCREEN_HEIGHT,
                    background: COLOR_BG,
                    position: 'relative',
                    overflow: 'hidden',
                    border: '1px solid #333',
                    fontFamily: 'monospace', // Simulating pixel font roughly
                }}
            >
                {/* Header */}
                <div
                    style={{
                        height: 50,
                        background: COLOR_HEADER,
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0 20px',
                        color: COLOR_TEXT,
                        justifyContent: 'space-between',
                    }}
                >
                    <button onClick={() => navigate(-1)} style={{ fontSize: '24px' }}>
                        ◀
                    </button>
                    <div style={{ fontSize: '24px' }}>
                        {date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </div>
                    <button onClick={() => navigate(1)} style={{ fontSize: '24px' }}>
                        ▶
                    </button>

                    <div style={{ display: 'flex', gap: '5px' }}>
                        {(['DAY', 'WEEK', 'MONTH'] as const).map((v) => (
                            <button
                                key={v}
                                onClick={() => setView(v)}
                                style={{
                                    background: view === v ? '#4A69' : 'transparent',
                                    color: COLOR_TEXT,
                                    border: `1px solid ${COLOR_TEXT}`,
                                    padding: '5px 10px',
                                    borderRadius: '4px',
                                }}
                            >
                                {v}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Views */}
                <div style={{ padding: '0', height: 'calc(100% - 50px)' }}>
                    {view === 'MONTH' && <MonthView date={date} events={events} />}
                    {view === 'WEEK' && <WeekView date={date} events={events} />}
                    {view === 'DAY' && <DayView date={date} events={events} />}
                </div>

                {/* Legend (Overlay at bottom) */}
                <div style={{ position: 'absolute', bottom: 10, left: 20, display: 'flex', gap: '20px' }}>
                    {calendars.map(cal => (
                        <div key={cal.name} style={{ display: 'flex', alignItems: 'center', gap: '5px', color: COLOR_TEXT }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: cal.color }}></div>
                            {cal.name}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// Sub-components for views

function MonthView({ date, events }: { date: Date; events: CalendarEvent[] }) {
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

    // Grid calc
    const cols = 7;
    const rows = 6;
    const cellW = SCREEN_WIDTH / cols;
    const cellH = (SCREEN_HEIGHT - 80) / rows; // minus header and legend space

    const startY = 30; // Day headers height

    const days = [];
    for (let i = 0; i < 42; i++) {
        const d = i - startOffset + 1;
        if (d > 0 && d <= daysInMonth) {
            const current = new Date(date.getFullYear(), date.getMonth(), d);
            days.push(current);
        } else {
            days.push(null);
        }
    }

    const today = new Date();

    return (
        <div style={{ height: '100%', position: 'relative' }}>
            {/* Day Headers */}
            <div style={{ display: 'flex', height: 30, color: COLOR_TEXT_DIM }}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                    <div key={d} style={{ width: cellW, textAlign: 'center' }}>{d}</div>
                ))}
            </div>

            {/* Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(7, 1fr)`, height: 'calc(100% - 30px)' }}>
                {days.map((d, i) => {
                    if (!d) return <div key={i} style={{ border: `1px solid ${COLOR_GRID}` }} />;

                    const isToday = d.toDateString() === today.toDateString();
                    const dayEvents = events.filter(e => {
                        const start = new Date(e.start);
                        const end = new Date(e.end);
                        const dayStart = new Date(d);
                        dayStart.setHours(0, 0, 0, 0);
                        const dayEnd = new Date(d);
                        dayEnd.setHours(23, 59, 59, 999);
                        return start < dayEnd && end > dayStart;
                    }).slice(0, 5); // Max 5 events per day in month view

                    return (
                        <div key={i} style={{
                            border: `1px solid ${COLOR_GRID}`,
                            background: isToday ? COLOR_TODAY : 'transparent',
                            padding: '2px',
                            overflow: 'hidden'
                        }}>
                            <div style={{ color: isToday ? '#FFE0' : COLOR_TEXT }}>{d.getDate()}</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                {dayEvents.map(e => (
                                    <div key={e.id} style={{
                                        background: e.color,
                                        fontSize: '10px',
                                        color: '#000',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        borderRadius: '2px',
                                        padding: '0 2px'
                                    }}>
                                        {e.title}
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    )
}

function WeekView({ date, events }: { date: Date; events: CalendarEvent[] }) {
    const today = new Date();
    // Start of week (Sunday)
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());

    // Grid config
    const hourH = 40;
    const leftMargin = 50;
    const colW = (SCREEN_WIDTH - leftMargin) / 7;
    const startHour = 7;
    const endHour = 21;

    return (
        <div style={{ height: '100%', overflowY: 'auto', position: 'relative' }}>
            {/* Header Row */}
            <div style={{ display: 'flex', paddingLeft: leftMargin, borderBottom: `1px solid ${COLOR_GRID}` }}>
                {Array.from({ length: 7 }).map((_, i) => {
                    const d = new Date(weekStart);
                    d.setDate(weekStart.getDate() + i);
                    const isToday = d.toDateString() === today.toDateString();
                    return (
                        <div key={i} style={{
                            width: colW,
                            textAlign: 'center',
                            color: COLOR_TEXT,
                            background: isToday ? COLOR_TODAY : 'transparent',
                            padding: '5px'
                        }}>
                            <div style={{ fontSize: '12px' }}>{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                            <div style={{ fontSize: '16px' }}>{d.getDate()}</div>
                        </div>
                    );
                })}
            </div>

            {/* Time Grid */}
            <div style={{ position: 'relative', height: (endHour - startHour + 1) * hourH }}>
                {Array.from({ length: endHour - startHour + 1 }).map((_, i) => {
                    const h = startHour + i;
                    return (
                        <div key={h} style={{
                            position: 'absolute',
                            top: i * hourH,
                            left: 0,
                            right: 0,
                            borderTop: `1px solid ${COLOR_GRID}`,
                            height: hourH
                        }}>
                            <span style={{ position: 'absolute', left: 5, top: -8, color: COLOR_TEXT_DIM, fontSize: '10px' }}>{h}:00</span>
                        </div>
                    );
                })}

                {/* Events */}
                {Array.from({ length: 7 }).map((_, dayIdx) => {
                    const d = new Date(weekStart);
                    d.setDate(weekStart.getDate() + dayIdx);
                    const dayStartTimestamp = new Date(d);
                    dayStartTimestamp.setHours(0, 0, 0, 0);
                    const dayEndTimestamp = new Date(d);
                    dayEndTimestamp.setHours(23, 59, 59, 999);

                    const dayEvents = events.filter(e => {
                        const start = new Date(e.start);
                        const end = new Date(e.end);
                        return start < dayEndTimestamp && end > dayStartTimestamp;
                    });

                    return dayEvents.map(e => {
                        const start = new Date(e.start);
                        const end = new Date(e.end);

                        // Calculate position
                        let startH = start.getHours() + start.getMinutes() / 60;
                        let endH = end.getHours() + end.getMinutes() / 60;

                        // Clamp to view
                        if (startH < startHour) startH = startHour;
                        if (endH > endHour) endH = endHour;

                        const top = (startH - startHour) * hourH;
                        const height = (endH - startH) * hourH;

                        if (height <= 0) return null;

                        return (
                            <div key={e.id} style={{
                                position: 'absolute',
                                left: leftMargin + dayIdx * colW + 2,
                                width: colW - 4,
                                top: top,
                                height: height,
                                background: e.color,
                                borderRadius: '3px',
                                padding: '2px',
                                color: '#fff',
                                fontSize: '10px',
                                overflow: 'hidden'
                            }}>
                                {e.title}
                            </div>
                        );
                    });
                })}
            </div>
        </div>
    );
}

function DayView({ date, events }: { date: Date; events: CalendarEvent[] }) {
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();

    const hourH = 50;
    const leftMargin = 60;
    const startHour = 6;
    const endHour = 22;

    const dayStartObs = new Date(date);
    dayStartObs.setHours(0, 0, 0, 0);
    const dayEndObs = new Date(date);
    dayEndObs.setHours(23, 59, 59, 999);

    const dayEvents = events.filter(e => {
        const start = new Date(e.start);
        const end = new Date(e.end);
        return start < dayEndObs && end > dayStartObs;
    });

    return (
        <div style={{ height: '100%', overflowY: 'auto' }}>
            <div style={{ padding: '10px 0 10px 60px', color: isToday ? '#FFE0' : COLOR_TEXT, fontSize: '20px' }}>
                {date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                {isToday && " (Today)"}
            </div>

            <div style={{ position: 'relative', height: (endHour - startHour + 1) * hourH }}>
                {Array.from({ length: endHour - startHour + 1 }).map((_, i) => {
                    const h = startHour + i;
                    return (
                        <div key={h} style={{
                            position: 'absolute',
                            top: i * hourH,
                            left: 0,
                            right: 20,
                            borderTop: `1px solid ${COLOR_GRID}`,
                            height: hourH
                        }}>
                            <span style={{ position: 'absolute', left: 10, top: -10, color: COLOR_TEXT_DIM, fontSize: '14px' }}>{h}:00</span>
                        </div>
                    );
                })}

                {dayEvents.map(e => {
                    const start = new Date(e.start);
                    const end = new Date(e.end);

                    let startH = start.getHours() + start.getMinutes() / 60;
                    let endH = end.getHours() + end.getMinutes() / 60;

                    if (startH < startHour) startH = startHour;
                    if (endH > endHour) endH = endHour;

                    const top = (startH - startHour) * hourH;
                    const height = (endH - startH) * hourH;

                    if (height <= 0) return null;

                    return (
                        <div key={e.id} style={{
                            position: 'absolute',
                            left: leftMargin + 10,
                            right: 30, // some padding on right
                            top: top,
                            height: height,
                            background: e.color,
                            borderRadius: '4px',
                            padding: '5px',
                            color: '#fff',
                            overflow: 'hidden'
                        }}>
                            <div style={{ fontWeight: 'bold' }}>{e.title}</div>
                            <div style={{ fontSize: '12px' }}>
                                {start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} -
                                {end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
