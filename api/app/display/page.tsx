'use client';

import { useState, useEffect, useCallback } from 'react';

// Constants matching ESP32
const SCREEN_WIDTH = 1024;
const SCREEN_HEIGHT = 600;
const HEADER_HEIGHT = 50;
const HOUR_HEIGHT = 48;

// Premium Dark Theme Colors
const COLOR_BG = '#0a0a12';
const COLOR_HEADER = 'rgba(20, 20, 30, 0.8)';
const COLOR_TODAY_BG = 'rgba(255, 255, 255, 0.08)';
const COLOR_TEXT = '#FFFFFF';
const COLOR_TEXT_DIM = '#9CA3AF';
const COLOR_GRID = '#2A2A35';
const COLOR_ACCENT = '#6366f1';

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

interface CalendarInfo {
    name: string;
    color: string;
}

function formatLocation(loc?: string) {
    if (!loc) return null;
    const lower = loc.toLowerCase();
    if (lower.includes('teams') || lower.includes('zoom') || lower.includes('meet') || lower.includes('webex')) {
        return 'Online';
    }
    return loc;
}

// German Formatters
const dateFormatter = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const monthFormatter = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' });
const timeFormatter = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const weekdayShort = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

export default function Display() {
    const [apiKey, setApiKey] = useState('');
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [calendars, setCalendars] = useState<CalendarInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Display state
    const [view, setView] = useState<'DAY' | 'WEEK' | 'MONTH'>('WEEK');
    const [date, setDate] = useState(new Date());
    const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

    // Touch gesture state
    const [touchStart, setTouchStart] = useState<{ x: number, y: number } | null>(null);

    // Auto-refresh interval (in minutes)
    const [refreshInterval, setRefreshInterval] = useState(15);

    // Read API key and settings from URL on startup
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const keyFromUrl = params.get('apiKey') || params.get('key');
        const viewFromUrl = params.get('view') as 'DAY' | 'WEEK' | 'MONTH' | null;
        const refreshFromUrl = params.get('refresh');

        if (keyFromUrl) {
            setApiKey(keyFromUrl);
        }

        if (viewFromUrl && ['DAY', 'WEEK', 'MONTH'].includes(viewFromUrl)) {
            setView(viewFromUrl);
        }

        if (refreshFromUrl) {
            const interval = parseInt(refreshFromUrl, 10);
            if (!isNaN(interval) && interval > 0) {
                setRefreshInterval(interval);
            }
        }
    }, []);

    const fetchEvents = useCallback(async () => {
        if (!apiKey) {
            setLoading(false);
            return;
        }

        setLoading(true);
        setError('');
        try {
            const start = new Date(date);
            start.setMonth(start.getMonth() - 1);
            start.setDate(1);

            const end = new Date(date);
            end.setMonth(end.getMonth() + 2);
            end.setDate(0);

            const res = await fetch(
                `/api/calendar?from=${start.toISOString()}&to=${end.toISOString()}`,
                {
                    headers: {
                        'x-api-key': apiKey,
                    },
                }
            );

            if (!res.ok) {
                throw new Error(res.status === 401 ? 'Zugriff verweigert' : 'Fehler beim Laden');
            }

            const data = await res.json();
            setEvents(data.events);
            setCalendars(data.calendars);
            setError('');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [apiKey, date]);

    // Initial load
    useEffect(() => {
        if (apiKey) {
            fetchEvents();
        }
    }, [apiKey, fetchEvents]);

    // Auto-refresh
    useEffect(() => {
        if (!apiKey || refreshInterval <= 0) return;

        const timer = setInterval(() => {
            fetchEvents();
        }, refreshInterval * 60 * 1000);

        return () => clearInterval(timer);
    }, [apiKey, refreshInterval, fetchEvents]);

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

    const jumpToToday = () => {
        setDate(new Date());
    };

    const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
        const x = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const y = 'touches' in e ? e.touches[0].clientY : e.clientY;
        setTouchStart({ x, y });
    };

    const handleTouchEnd = (e: React.TouchEvent | React.MouseEvent) => {
        if (!touchStart) return;
        const x = 'changedTouches' in e ? e.changedTouches[0].clientX : e.clientX;
        const y = 'changedTouches' in e ? e.changedTouches[0].clientY : e.clientY;

        const dx = x - touchStart.x;
        const dy = y - touchStart.y;

        if (Math.abs(dx) > 100 && Math.abs(dy) < 60) {
            if (dx > 0) navigate(-1);
            else navigate(1);
        }
        setTouchStart(null);
    };

    // Show error or loading state
    if (!apiKey) {
        return (
            <div style={{
                width: '100vw',
                height: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: COLOR_BG,
                color: COLOR_TEXT,
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
                <div style={{ textAlign: 'center', maxWidth: '600px', padding: '40px' }}>
                    <h1 style={{ fontSize: '32px', marginBottom: '20px' }}>Familienkalender</h1>
                    <p style={{ color: COLOR_TEXT_DIM, marginBottom: '20px' }}>
                        Bitte öffnen Sie diese Seite mit einem API-Schlüssel:
                    </p>
                    <code style={{
                        display: 'block',
                        background: 'rgba(255,255,255,0.1)',
                        padding: '15px',
                        borderRadius: '8px',
                        fontSize: '14px',
                        wordBreak: 'break-all'
                    }}>
                        /display?apiKey=IHR_API_SCHLÜSSEL
                    </code>
                    <p style={{ color: COLOR_TEXT_DIM, marginTop: '20px', fontSize: '14px' }}>
                        Optionale Parameter: &view=WEEK|DAY|MONTH &refresh=15 (Minuten)
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div style={{
            width: '100vw',
            height: '100vh',
            background: '#000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden'
        }}>
            <div
                style={{
                    width: SCREEN_WIDTH,
                    height: SCREEN_HEIGHT,
                    background: COLOR_BG,
                    position: 'relative',
                    overflow: 'hidden',
                    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    userSelect: 'none'
                }}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                onMouseDown={handleTouchStart}
                onMouseUp={handleTouchEnd}
            >
                {/* Glass Header */}
                <div
                    style={{
                        height: HEADER_HEIGHT,
                        background: COLOR_HEADER,
                        backdropFilter: 'blur(10px)',
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0 10px',
                        color: COLOR_TEXT,
                        justifyContent: 'space-between',
                        borderBottom: '1px solid rgba(255,255,255,0.1)',
                        zIndex: 20
                    }}
                >
                    {/* Left Area & Prev Button */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <button
                            onClick={(e) => { e.stopPropagation(); navigate(-1); }}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: COLOR_TEXT,
                                fontSize: '24px',
                                cursor: 'pointer',
                                width: 50,
                                height: 50,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                opacity: 0.8
                            }}>
                            ◀
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); jumpToToday(); }} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: COLOR_TEXT, padding: '6px 16px', borderRadius: '20px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}>Heute</button>
                    </div>

                    <div style={{ fontSize: '18px', fontWeight: 500, letterSpacing: '0.5px' }}>
                        {view === 'MONTH'
                            ? monthFormatter.format(date)
                            : view === 'DAY'
                                ? dateFormatter.format(date)
                                : `Woche vom ${new Date(new Date(date).setDate(date.getDate() - (date.getDay() === 0 ? 6 : date.getDay() - 1))).toLocaleDateString('de-DE')}`
                        }
                    </div>

                    {/* Right Area & Next Button */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <div style={{ display: 'flex', gap: '4px', background: 'rgba(0,0,0,0.3)', padding: '3px', borderRadius: '8px', marginRight: '5px' }}>
                            {([['Tag', 'DAY'], ['Woche', 'WEEK'], ['Monat', 'MONTH']] as const).map(([label, v]) => (
                                <button
                                    key={v}
                                    onClick={(e) => { e.stopPropagation(); setView(v); }}
                                    style={{
                                        background: view === v ? COLOR_ACCENT : 'transparent',
                                        color: COLOR_TEXT,
                                        border: 'none',
                                        padding: '6px 10px',
                                        borderRadius: '6px',
                                        fontSize: '12px',
                                        cursor: 'pointer',
                                        transition: 'background 0.2s',
                                        fontWeight: 500
                                    }}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={(e) => { e.stopPropagation(); navigate(1); }}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: COLOR_TEXT,
                                fontSize: '24px',
                                cursor: 'pointer',
                                width: 50,
                                height: 50,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                opacity: 0.8
                            }}>
                            ▶
                        </button>
                    </div>
                </div>

                {/* Views */}
                <div style={{ padding: '0', height: `calc(100% - ${HEADER_HEIGHT}px)` }}>
                    {view === 'MONTH' && <MonthView date={date} events={events} onEventClick={setSelectedEvent} />}
                    {view === 'WEEK' && <WeekView date={date} events={events} onEventClick={setSelectedEvent} />}
                    {view === 'DAY' && <DayView date={date} events={events} onEventClick={setSelectedEvent} />}
                </div>

                {/* Floating Legend */}
                <div style={{
                    position: 'absolute',
                    bottom: 20,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    gap: '20px',
                    background: 'rgba(20,20,30,0.9)',
                    padding: '8px 16px',
                    borderRadius: '30px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    backdropFilter: 'blur(5px)',
                    zIndex: 50
                }}>
                    {calendars.map(cal => (
                        <div key={cal.name} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: COLOR_TEXT_DIM, fontSize: '12px' }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: cal.color, boxShadow: `0 0 8px ${cal.color}` }}></div>
                            {cal.name}
                        </div>
                    ))}
                </div>

                {/* Error indicator */}
                {error && (
                    <div style={{
                        position: 'absolute',
                        top: HEADER_HEIGHT + 10,
                        right: 10,
                        background: 'rgba(220, 38, 38, 0.9)',
                        color: '#fff',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        zIndex: 60
                    }}>
                        ⚠️ {error}
                    </div>
                )}

                {/* Loading indicator */}
                {loading && (
                    <div style={{
                        position: 'absolute',
                        top: HEADER_HEIGHT + 10,
                        right: 10,
                        background: 'rgba(99, 102, 241, 0.9)',
                        color: '#fff',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        zIndex: 60
                    }}>
                        Aktualisiere...
                    </div>
                )}

                {/* Modal Overlay */}
                {selectedEvent && (
                    <div
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            background: 'rgba(0,0,0,0.6)',
                            backdropFilter: 'blur(4px)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 100,
                            transition: 'all 0.3s'
                        }}
                        onClick={() => setSelectedEvent(null)}
                    >
                        <div
                            style={{
                                background: '#161622',
                                borderTop: `4px solid ${selectedEvent.color}`,
                                width: '480px',
                                maxWidth: '90%',
                                maxHeight: '85%',
                                display: 'flex',
                                flexDirection: 'column',
                                padding: '25px',
                                borderRadius: '16px',
                                boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                                color: COLOR_TEXT,
                                animation: 'popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div style={{ marginBottom: '20px' }}>
                                <div style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    background: 'rgba(255,255,255,0.05)',
                                    padding: '4px 10px',
                                    borderRadius: '20px',
                                    fontSize: '11px',
                                    color: selectedEvent.color,
                                    marginBottom: '8px',
                                    fontWeight: 600
                                }}>
                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: selectedEvent.color }}></div>
                                    {selectedEvent.calendar}
                                </div>
                                <h2 style={{ margin: '0', fontSize: '24px', lineHeight: '1.2', fontWeight: 600 }}>
                                    {selectedEvent.title}
                                </h2>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '16px', color: COLOR_TEXT_DIM }}>
                                <span style={{ fontSize: '18px' }}>🕒</span>
                                <div style={{ fontSize: '15px', lineHeight: '1.5' }}>
                                    <div style={{ color: '#fff' }}>{dateFormatter.format(new Date(selectedEvent.start))}</div>
                                    {timeFormatter.format(new Date(selectedEvent.start))} - {timeFormatter.format(new Date(selectedEvent.end))} Uhr
                                </div>
                            </div>

                            {selectedEvent.location && (
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '16px', color: COLOR_TEXT_DIM }}>
                                    <span style={{ fontSize: '18px' }}>📍</span>
                                    <div style={{ fontSize: '15px' }}>{formatLocation(selectedEvent.location) || selectedEvent.location}</div>
                                </div>
                            )}

                            <div style={{
                                marginTop: '10px',
                                paddingTop: '20px',
                                borderTop: `1px solid ${COLOR_GRID}`,
                                fontSize: '14px',
                                lineHeight: '1.6',
                                color: '#D1D5DB',
                                whiteSpace: 'pre-wrap',
                                overflowY: 'auto',
                                flex: 1,
                                minHeight: 0,
                            }}>
                                {selectedEvent.description || <span style={{ fontStyle: 'italic', opacity: 0.5 }}>Keine Beschreibung verfügbar.</span>}
                            </div>

                            <button
                                onClick={() => setSelectedEvent(null)}
                                style={{
                                    marginTop: '25px',
                                    width: '100%',
                                    padding: '12px',
                                    background: 'rgba(255,255,255,0.05)',
                                    border: 'none',
                                    color: COLOR_TEXT,
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontWeight: 500,
                                    transition: 'background 0.2s'
                                }}
                                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                                onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                            >
                                Schließen
                            </button>
                        </div>
                    </div>
                )}
            </div>
            <style jsx global>{`
        @keyframes popIn {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #333; borderRadius: 3px; }
        body { margin: 0; padding: 0; overflow: hidden; }
      `}</style>
        </div>
    );
}

// Import view components from simulator (reuse the same components)
// For now, copy them here - in production you might want to extract to shared components

function computeEventLayout(events: CalendarEvent[]) {
    const sorted = [...events].sort((a, b) => {
        const sa = new Date(a.start).getTime();
        const sb = new Date(b.start).getTime();
        if (sa !== sb) return sa - sb;
        return new Date(b.end).getTime() - new Date(a.end).getTime();
    });

    const columns: CalendarEvent[][] = [];
    const layout = new Map<string, { col: number, totalCols: number }>();

    for (const event of sorted) {
        let placed = false;
        const eventStart = new Date(event.start).getTime();

        for (let i = 0; i < columns.length; i++) {
            const col = columns[i];
            const lastEvent = col[col.length - 1];
            const prevEnd = new Date(lastEvent.end).getTime();
            if (eventStart >= prevEnd) {
                col.push(event);
                layout.set(event.id, { col: i, totalCols: 1 });
                placed = true;
                break;
            }
        }
        if (!placed) {
            columns.push([event]);
            layout.set(event.id, { col: columns.length - 1, totalCols: 1 });
        }
    }

    const processedLayout = new Map<string, { left: number, width: number }>();

    for (const event of sorted) {
        const start = new Date(event.start).getTime();
        const end = new Date(event.end).getTime();

        let overlappingCols = 0;
        for (const col of columns) {
            const overlaps = col.some(e => {
                const s = new Date(e.start).getTime();
                const e_end = new Date(e.end).getTime();
                return Math.max(start, s) < Math.min(end, e_end);
            });
            if (overlaps) overlappingCols++;
        }

        const { col } = layout.get(event.id)!;
        const width = 100 / (overlappingCols || 1);
        const left = (col * width);

        processedLayout.set(event.id, { left, width });
    }

    return processedLayout;
}

function MonthView({ date, events, onEventClick }: { date: Date; events: CalendarEvent[], onEventClick: (e: CalendarEvent) => void }) {
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek < 0) startDayOfWeek = 6;

    const days: Date[] = [];
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - startDayOfWeek);

    for (let i = 0; i < 42; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        days.push(d);
    }

    const today = new Date();
    const currentMonth = date.getMonth();

    return (
        <div style={{ height: '100%', position: 'relative', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <div style={{ display: 'flex', height: 40, flexShrink: 0, alignItems: 'center', borderBottom: `1px solid ${COLOR_GRID}`, color: COLOR_TEXT_DIM, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => (
                    <div key={d} style={{ flex: 1, textAlign: 'center' }}>{d}</div>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: `repeat(7, 1fr)`, minHeight: '100%' }}>
                {days.map((d, i) => {
                    const isCurrentMonth = d.getMonth() === currentMonth;
                    const isToday = d.toDateString() === today.toDateString();

                    const dayEvents = events.filter(e => {
                        const start = new Date(e.start);
                        const end = new Date(e.end);
                        const dayStart = new Date(d);
                        dayStart.setHours(0, 0, 0, 0);
                        const dayEnd = new Date(d);
                        dayEnd.setHours(23, 59, 59, 999);
                        return start < dayEnd && end > dayStart;
                    }).slice(0, 5);

                    return (
                        <div key={i} style={{
                            borderRight: `1px solid ${COLOR_GRID}`,
                            borderBottom: `1px solid ${COLOR_GRID}`,
                            background: isToday ? COLOR_TODAY_BG : (isCurrentMonth ? 'transparent' : 'rgba(255,255,255,0.02)'),
                            padding: '4px',
                            overflow: 'hidden',
                            minHeight: 100,
                            opacity: isCurrentMonth ? 1 : 0.5
                        }}>
                            <div style={{
                                textAlign: 'center',
                                marginBottom: '4px',
                                color: isToday ? '#fff' : (isCurrentMonth ? COLOR_TEXT_DIM : '#4B5563'),
                                fontWeight: isToday ? 'bold' : 'normal',
                                background: isToday ? COLOR_ACCENT : 'transparent',
                                width: 24,
                                height: 24,
                                lineHeight: '24px',
                                borderRadius: '50%',
                                margin: '0 auto 4px auto',
                                fontSize: '13px'
                            }}>
                                {d.getDate()}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                {dayEvents.map(e => (
                                    <div
                                        key={e.id}
                                        onClick={() => onEventClick(e)}
                                        style={{
                                            background: e.color + '40',
                                            borderLeft: `3px solid ${e.color}`,
                                            fontSize: '11px',
                                            color: '#eee',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            borderRadius: '2px',
                                            padding: '2px 4px',
                                            cursor: 'pointer'
                                        }}>
                                        {e.title}
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
            <div style={{ height: 60, flexShrink: 0 }}></div>
        </div>
    )
}

function WeekView({ date, events, onEventClick }: { date: Date; events: CalendarEvent[], onEventClick: (e: CalendarEvent) => void }) {
    const today = new Date();
    const weekStart = new Date(date);
    const day = weekStart.getDay();
    const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
    weekStart.setDate(diff);

    const leftMargin = 50;
    const colW = (SCREEN_WIDTH - leftMargin) / 7;
    const startHour = 7;
    const endHour = 20;

    return (
        <div style={{ height: '100%', overflowY: 'auto', position: 'relative' }}>
            <div style={{ display: 'flex', paddingLeft: leftMargin, borderBottom: `1px solid ${COLOR_GRID}`, position: 'sticky', top: 0, background: COLOR_BG, zIndex: 5, height: 45 }}>
                {Array.from({ length: 7 }).map((_, i) => {
                    const d = new Date(weekStart);
                    d.setDate(weekStart.getDate() + i);
                    const isToday = d.toDateString() === today.toDateString();
                    return (
                        <div key={i} style={{
                            flex: 1,
                            textAlign: 'center',
                            color: isToday ? '#fff' : COLOR_TEXT_DIM,
                            background: isToday ? COLOR_TODAY_BG : 'transparent',
                            padding: '8px 0',
                            borderRight: `1px solid ${COLOR_GRID}`
                        }}>
                            <div style={{ fontSize: '11px', textTransform: 'uppercase', opacity: 0.7 }}>{weekdayShort[d.getDay()]}</div>
                            <div style={{ fontSize: '18px', fontWeight: isToday ? 600 : 400 }}>{d.getDate()}</div>
                        </div>
                    );
                })}
            </div>

            <div style={{ position: 'relative', height: (endHour - startHour + 1) * HOUR_HEIGHT, paddingBottom: 80 }}>
                {Array.from({ length: endHour - startHour + 1 }).map((_, i) => {
                    const h = startHour + i;
                    return (
                        <div key={h} style={{
                            position: 'absolute',
                            top: i * HOUR_HEIGHT,
                            left: 0,
                            right: 0,
                            borderTop: `1px solid ${COLOR_GRID}`,
                            height: HOUR_HEIGHT
                        }}>
                            <span style={{ position: 'absolute', left: 8, top: -8, color: COLOR_TEXT_DIM, fontSize: '11px' }}>{h}</span>
                        </div>
                    );
                })}

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

                    const layout = computeEventLayout(dayEvents);

                    return dayEvents.map(e => {
                        const start = new Date(e.start);
                        const end = new Date(e.end);

                        let startH = start.getHours() + start.getMinutes() / 60;
                        let endH = end.getHours() + end.getMinutes() / 60;

                        if (startH < startHour) startH = startHour;
                        if (endH > endHour) endH = endHour;

                        const top = (startH - startHour) * HOUR_HEIGHT;
                        const height = (endH - startH) * HOUR_HEIGHT;

                        if (height <= 0) return null;

                        const showLoc = height > 35 && e.location;
                        const colPadding = 2;

                        const overlappingEvents = dayEvents.filter(other => {
                            if (other.id === e.id) return false;
                            const otherStart = new Date(other.start);
                            const otherEnd = new Date(other.end);
                            let otherStartH = otherStart.getHours() + otherStart.getMinutes() / 60;
                            let otherEndH = otherEnd.getHours() + otherEnd.getMinutes() / 60;
                            return Math.max(startH, otherStartH) < Math.min(endH, otherEndH);
                        });

                        let pixelLeft: number;
                        let pixelWidth: number;

                        if (overlappingEvents.length === 0) {
                            pixelLeft = leftMargin + dayIdx * colW + colPadding;
                            pixelWidth = colW - (colPadding * 2);
                        } else {
                            const { left, width } = layout.get(e.id) || { left: 0, width: 100 };
                            const usableColW = colW - (colPadding * 2);
                            pixelLeft = leftMargin + dayIdx * colW + colPadding + (usableColW * (left / 100));
                            pixelWidth = (usableColW * (width / 100)) - colPadding;
                            if (pixelWidth < 20) pixelWidth = 20;
                        }

                        return (
                            <div
                                key={e.id}
                                onClick={() => onEventClick(e)}
                                style={{
                                    position: 'absolute',
                                    boxSizing: 'border-box',
                                    left: pixelLeft,
                                    width: Math.max(pixelWidth, 20),
                                    top: top + 1,
                                    height: height - 2,
                                    background: e.color,
                                    borderRadius: '6px',
                                    padding: '4px 6px',
                                    color: '#fff',
                                    fontSize: '11px',
                                    overflow: 'hidden',
                                    cursor: 'pointer',
                                    zIndex: 1,
                                    boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                                    border: '1px solid rgba(255,255,255,0.2)'
                                }}>
                                <div style={{ fontWeight: 600 }}>{e.title}</div>
                                {showLoc && (
                                    <div style={{
                                        marginTop: '2px',
                                        fontSize: '10px',
                                        opacity: 0.9,
                                        whiteSpace: 'nowrap',
                                        textOverflow: 'ellipsis',
                                        overflow: 'hidden'
                                    }}>
                                        📍{formatLocation(e.location)}
                                    </div>
                                )}
                            </div>
                        );
                    });
                })}

                {date.toDateString() === new Date().toDateString() && (
                    <div style={{
                        position: 'absolute',
                        top: (new Date().getHours() - startHour + new Date().getMinutes() / 60) * HOUR_HEIGHT,
                        left: leftMargin,
                        right: 0,
                        height: 2,
                        background: '#f43f5e',
                        zIndex: 2,
                        pointerEvents: 'none'
                    }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f43f5e', marginTop: -3, marginLeft: -4 }}></div>
                    </div>
                )}
            </div>
        </div>
    );
}

function DayView({ date, events, onEventClick }: { date: Date; events: CalendarEvent[], onEventClick: (e: CalendarEvent) => void }) {
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();

    const hourH = HOUR_HEIGHT;
    const leftMargin = 70;
    const startHour = 7;
    const endHour = 20;

    const dayStartObs = new Date(date);
    dayStartObs.setHours(0, 0, 0, 0);
    const dayEndObs = new Date(date);
    dayEndObs.setHours(23, 59, 59, 999);

    const dayEvents = events.filter(e => {
        const start = new Date(e.start);
        const end = new Date(e.end);
        return start < dayEndObs && end > dayStartObs;
    });

    const layout = computeEventLayout(dayEvents);

    return (
        <div style={{ height: '100%', overflowY: 'auto' }}>
            <div style={{ padding: '10px 0 10px 70px', color: isToday ? '#fff' : COLOR_TEXT, fontSize: '24px', fontWeight: 300 }}>
                <span style={{ fontWeight: 600 }}>{dateFormatter.format(date)}</span>
                {isToday && <span style={{ marginLeft: '10px', fontSize: '14px', background: COLOR_ACCENT, padding: '2px 8px', borderRadius: '10px', verticalAlign: 'middle' }}>HEUTE</span>}
            </div>

            <div style={{ position: 'relative', height: (endHour - startHour + 1) * hourH, paddingBottom: 80 }}>
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
                            <span style={{ position: 'absolute', left: 15, top: -12, color: COLOR_TEXT_DIM, fontSize: '14px' }}>{h}:00</span>
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

                    const showLoc = height > 60 && e.location;
                    const { left, width } = layout.get(e.id) || { left: 0, width: 100 };

                    const totalW = SCREEN_WIDTH - leftMargin - 30;
                    const pixelLeft = leftMargin + (totalW * (left / 100));
                    const pixelWidth = (totalW * (width / 100)) - 10;

                    return (
                        <div
                            key={e.id}
                            onClick={() => onEventClick(e)}
                            style={{
                                position: 'absolute',
                                left: pixelLeft,
                                width: pixelWidth,
                                top: top,
                                height: height,
                                background: e.color,
                                borderRadius: '8px',
                                padding: '8px 12px',
                                color: '#fff',
                                overflow: 'hidden',
                                cursor: 'pointer',
                                boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
                                borderLeft: '4px solid rgba(0,0,0,0.2)'
                            }}>
                            <div style={{ fontWeight: 700, fontSize: '14px' }}>{e.title}</div>
                            <div style={{ fontSize: '13px', opacity: 0.9 }}>
                                {timeFormatter.format(start)} - {timeFormatter.format(end)}
                            </div>
                            {showLoc && (
                                <div style={{ fontSize: '13px', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <span>📍</span>
                                    <span style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                        {formatLocation(e.location)}
                                    </span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
