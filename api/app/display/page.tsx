'use client';

import { useState, useEffect, useCallback } from 'react';

// Responsive - use viewport dimensions instead of fixed values
const HEADER_HEIGHT = 60;
const HOUR_HEIGHT = 56;

// Theme definitions
const themes = {
    dark: {
        bg: '#0a0a12',
        header: 'rgba(20, 20, 30, 0.92)',
        todayBg: 'rgba(255, 255, 255, 0.08)',
        text: '#FFFFFF',
        textDim: '#9CA3AF',
        grid: '#2A2A35',
        accent: '#818cf8',
        cardBg: '#161622',
        legendBg: 'rgba(20, 20, 30, 0.95)',
        modalOverlay: 'rgba(0, 0, 0, 0.7)',
        buttonBg: 'rgba(255, 255, 255, 0.1)',
        buttonActiveBg: 'rgba(255, 255, 255, 0.15)',
        pillBg: 'rgba(0, 0, 0, 0.4)',
        codeBg: 'rgba(255, 255, 255, 0.1)',
    },
    light: {
        bg: '#f8fafc',
        header: 'rgba(255, 255, 255, 0.92)',
        todayBg: '#e0e7ff',
        text: '#1e293b',
        textDim: '#64748b',
        grid: '#e2e8f0',
        accent: '#6366f1',
        cardBg: '#ffffff',
        legendBg: 'rgba(255, 255, 255, 0.95)',
        modalOverlay: 'rgba(0, 0, 0, 0.4)',
        buttonBg: 'rgba(0, 0, 0, 0.06)',
        buttonActiveBg: 'rgba(0, 0, 0, 0.1)',
        pillBg: 'rgba(0, 0, 0, 0.06)',
        codeBg: 'rgba(0, 0, 0, 0.06)',
    },
};

type Theme = typeof themes.dark;

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
    
    // Theme state - defaults to light for family-friendly look
    const [darkMode, setDarkMode] = useState(false);
    const theme = darkMode ? themes.dark : themes.light;

    // Touch gesture state
    const [touchStart, setTouchStart] = useState<{ x: number, y: number, time: number } | null>(null);

    // Auto-refresh interval (in minutes)
    const [refreshInterval, setRefreshInterval] = useState(15);

    // Read API key and settings from URL on startup
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const keyFromUrl = params.get('apiKey') || params.get('key');
        const viewFromUrl = params.get('view') as 'DAY' | 'WEEK' | 'MONTH' | null;
        const refreshFromUrl = params.get('refresh');
        const themeFromUrl = params.get('theme');

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

        // Check URL param, then localStorage, then default to light
        if (themeFromUrl === 'dark') {
            setDarkMode(true);
        } else if (themeFromUrl === 'light') {
            setDarkMode(false);
        } else {
            const saved = localStorage.getItem('familyCalendarTheme');
            if (saved === 'dark') setDarkMode(true);
        }
    }, []);

    // Save theme preference
    const toggleTheme = useCallback(() => {
        setDarkMode(prev => {
            const newMode = !prev;
            localStorage.setItem('familyCalendarTheme', newMode ? 'dark' : 'light');
            return newMode;
        });
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
        setTouchStart({ x, y, time: Date.now() });
    };

    const handleTouchEnd = (e: React.TouchEvent | React.MouseEvent) => {
        if (!touchStart) return;
        const x = 'changedTouches' in e ? e.changedTouches[0].clientX : e.clientX;
        const y = 'changedTouches' in e ? e.changedTouches[0].clientY : e.clientY;

        const dx = x - touchStart.x;
        const dy = y - touchStart.y;
        const dt = Date.now() - touchStart.time;

        // Swipe detection: horizontal movement > 80px, vertical < 60px, time < 500ms
        if (Math.abs(dx) > 80 && Math.abs(dy) < 60 && dt < 500) {
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
                background: theme.bg,
                color: theme.text,
                fontFamily: '"Nunito", "Quicksand", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
                <div style={{ textAlign: 'center', maxWidth: '600px', padding: '40px' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>📅</div>
                    <h1 style={{ fontSize: '32px', marginBottom: '20px', fontWeight: 700 }}>Familienkalender</h1>
                    <p style={{ color: theme.textDim, marginBottom: '20px' }}>
                        Bitte öffnen Sie diese Seite mit einem API-Schlüssel:
                    </p>
                    <code style={{
                        display: 'block',
                        background: theme.codeBg,
                        padding: '15px',
                        borderRadius: '12px',
                        fontSize: '14px',
                        wordBreak: 'break-all'
                    }}>
                        /display?apiKey=IHR_API_SCHLÜSSEL
                    </code>
                    <p style={{ color: theme.textDim, marginTop: '20px', fontSize: '14px' }}>
                        Optionale Parameter: &view=WEEK|DAY|MONTH &refresh=15 &theme=light|dark
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div style={{
            width: '100vw',
            height: '100vh',
            background: theme.bg,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            fontFamily: '"Nunito", "Quicksand", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            userSelect: 'none',
            touchAction: 'pan-y',
            WebkitTapHighlightColor: 'transparent',
            transition: 'background 0.3s ease',
        }}>
            {/* Google Fonts */}
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&family=Quicksand:wght@400;500;600;700&display=swap');
            `}</style>
            
            {/* Glass Header */}
            <div
                style={{
                    height: HEADER_HEIGHT,
                    minHeight: HEADER_HEIGHT,
                    background: theme.header,
                    backdropFilter: 'blur(10px)',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 12px',
                    color: theme.text,
                    justifyContent: 'space-between',
                    borderBottom: `1px solid ${darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
                    zIndex: 20,
                    flexShrink: 0,
                    boxShadow: darkMode ? 'none' : '0 2px 8px rgba(0,0,0,0.04)',
                    transition: 'all 0.3s ease',
                }}
            >
                {/* Left Area & Prev Button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                        onClick={(e) => { e.stopPropagation(); navigate(-1); }}
                        aria-label="Vorherige Periode"
                        style={{
                            background: theme.buttonBg,
                            border: 'none',
                            color: theme.text,
                            fontSize: '20px',
                            cursor: 'pointer',
                            width: 48,
                            height: 48,
                            borderRadius: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            touchAction: 'manipulation',
                            transition: 'all 0.2s',
                        }}>
                        ◀
                    </button>
                    <button 
                        onClick={(e) => { e.stopPropagation(); jumpToToday(); }} 
                        style={{ 
                            background: theme.buttonActiveBg, 
                            border: 'none', 
                            color: theme.text, 
                            padding: '10px 20px', 
                            borderRadius: '24px', 
                            cursor: 'pointer', 
                            fontSize: '15px', 
                            fontWeight: 600,
                            minHeight: 44,
                            touchAction: 'manipulation',
                            transition: 'all 0.2s',
                        }}
                    >
                        Heute
                    </button>
                </div>

                <div style={{ fontSize: '18px', fontWeight: 600, letterSpacing: '0.3px', textAlign: 'center', flex: 1, padding: '0 10px' }}>
                    {view === 'MONTH'
                        ? monthFormatter.format(date)
                        : view === 'DAY'
                            ? dateFormatter.format(date)
                            : `Woche vom ${new Date(new Date(date).setDate(date.getDate() - (date.getDay() === 0 ? 6 : date.getDay() - 1))).toLocaleDateString('de-DE')}`
                    }
                </div>

                {/* Right Area & Next Button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {/* Theme Toggle */}
                    <button
                        onClick={(e) => { e.stopPropagation(); toggleTheme(); }}
                        aria-label={darkMode ? 'Heller Modus' : 'Dunkler Modus'}
                        title={darkMode ? 'Heller Modus' : 'Dunkler Modus'}
                        style={{
                            background: theme.buttonBg,
                            border: 'none',
                            color: theme.text,
                            fontSize: '22px',
                            cursor: 'pointer',
                            width: 44,
                            height: 44,
                            borderRadius: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            touchAction: 'manipulation',
                            transition: 'all 0.2s',
                        }}>
                        {darkMode ? '☀️' : '🌙'}
                    </button>
                    
                    <div style={{ display: 'flex', gap: '4px', background: theme.pillBg, padding: '4px', borderRadius: '12px' }}>
                        {([['Tag', 'DAY'], ['Woche', 'WEEK'], ['Monat', 'MONTH']] as const).map(([label, v]) => (
                            <button
                                key={v}
                                onClick={(e) => { e.stopPropagation(); setView(v); }}
                                style={{
                                    background: view === v ? theme.accent : 'transparent',
                                    color: view === v ? '#fff' : theme.text,
                                    border: 'none',
                                    padding: '10px 14px',
                                    borderRadius: '8px',
                                    fontSize: '14px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    fontWeight: 600,
                                    minHeight: 44,
                                    touchAction: 'manipulation',
                                }}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={(e) => { e.stopPropagation(); navigate(1); }}
                        aria-label="Nächste Periode"
                        style={{
                            background: theme.buttonBg,
                            border: 'none',
                            color: theme.text,
                            fontSize: '20px',
                            cursor: 'pointer',
                            width: 48,
                            height: 48,
                            borderRadius: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            touchAction: 'manipulation',
                            transition: 'all 0.2s',
                        }}>
                        ▶
                    </button>
                </div>
            </div>

            {/* Views - Full height minus header */}
            <div 
                style={{ 
                    flex: 1, 
                    overflow: 'hidden', 
                    position: 'relative' 
                }}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                onMouseDown={handleTouchStart}
                onMouseUp={handleTouchEnd}
            >
                {view === 'MONTH' && <MonthView date={date} events={events} onEventClick={setSelectedEvent} theme={theme} />}
                {view === 'WEEK' && <WeekView date={date} events={events} onEventClick={setSelectedEvent} theme={theme} />}
                {view === 'DAY' && <DayView date={date} events={events} onEventClick={setSelectedEvent} theme={theme} />}
            </div>

            {/* Floating Legend */}
            <div style={{
                position: 'fixed',
                bottom: 16,
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                gap: '16px',
                background: theme.legendBg,
                padding: '10px 20px',
                borderRadius: '30px',
                border: `1px solid ${darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
                backdropFilter: 'blur(8px)',
                boxShadow: darkMode ? 'none' : '0 4px 12px rgba(0,0,0,0.08)',
                zIndex: 50,
                transition: 'all 0.3s ease',
            }}>
                {calendars.map(cal => (
                    <div key={cal.name} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: theme.textDim, fontSize: '13px', fontWeight: 500 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: cal.color, boxShadow: `0 0 8px ${cal.color}` }}></div>
                        {cal.name}
                    </div>
                ))}
            </div>

            {/* Error indicator */}
            {error && (
                <div style={{
                    position: 'fixed',
                    top: HEADER_HEIGHT + 12,
                    right: 12,
                    background: darkMode ? 'rgba(220, 38, 38, 0.95)' : '#fef2f2',
                    color: darkMode ? '#fff' : '#dc2626',
                    padding: '10px 18px',
                    borderRadius: '10px',
                    fontSize: '14px',
                    fontWeight: 500,
                    border: darkMode ? 'none' : '1px solid #fecaca',
                    zIndex: 60
                }}>
                    ⚠️ {error}
                </div>
            )}

            {/* Loading indicator */}
            {loading && (
                <div style={{
                    position: 'fixed',
                    top: HEADER_HEIGHT + 12,
                    right: 12,
                    background: darkMode ? 'rgba(99, 102, 241, 0.95)' : '#eef2ff',
                    color: darkMode ? '#fff' : '#6366f1',
                    padding: '10px 18px',
                    borderRadius: '10px',
                    fontSize: '14px',
                    fontWeight: 500,
                    border: darkMode ? 'none' : '1px solid #c7d2fe',
                    zIndex: 60
                }}>
                    Aktualisiere...
                </div>
            )}

            {/* Modal Overlay */}
            {selectedEvent && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        background: theme.modalOverlay,
                        backdropFilter: 'blur(6px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 100,
                        touchAction: 'manipulation',
                    }}
                    onClick={() => setSelectedEvent(null)}
                >
                    <div
                        style={{
                            background: theme.cardBg,
                            borderTop: `4px solid ${selectedEvent.color}`,
                            width: '90%',
                            maxWidth: '500px',
                            maxHeight: '85%',
                            display: 'flex',
                            flexDirection: 'column',
                            padding: '28px',
                            borderRadius: '20px',
                            boxShadow: darkMode ? '0 25px 60px rgba(0,0,0,0.5)' : '0 25px 60px rgba(0,0,0,0.15)',
                            color: theme.text,
                            animation: 'popIn 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ marginBottom: '20px' }}>
                            <div style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                background: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                                padding: '6px 12px',
                                borderRadius: '20px',
                                fontSize: '13px',
                                color: selectedEvent.color,
                                marginBottom: '10px',
                                fontWeight: 600
                            }}>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: selectedEvent.color }}></div>
                                {selectedEvent.calendar}
                            </div>
                            <h2 style={{ margin: '0', fontSize: '26px', lineHeight: '1.3', fontWeight: 600 }}>
                                {selectedEvent.title}
                            </h2>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '18px', color: theme.textDim }}>
                            <span style={{ fontSize: '20px' }}>🕒</span>
                            <div style={{ fontSize: '16px', lineHeight: '1.5' }}>
                                <div style={{ color: theme.text }}>{dateFormatter.format(new Date(selectedEvent.start))}</div>
                                {timeFormatter.format(new Date(selectedEvent.start))} - {timeFormatter.format(new Date(selectedEvent.end))} Uhr
                            </div>
                        </div>

                        {selectedEvent.location && (
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '18px', color: theme.textDim }}>
                                <span style={{ fontSize: '20px' }}>📍</span>
                                <div style={{ fontSize: '16px' }}>{formatLocation(selectedEvent.location) || selectedEvent.location}</div>
                            </div>
                        )}

                        <div style={{
                            marginTop: '12px',
                            paddingTop: '20px',
                            borderTop: `1px solid ${theme.grid}`,
                            fontSize: '15px',
                            lineHeight: '1.7',
                            color: theme.textDim,
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
                                marginTop: '24px',
                                width: '100%',
                                padding: '16px',
                                background: theme.buttonBg,
                                border: 'none',
                                color: theme.text,
                                borderRadius: '12px',
                                cursor: 'pointer',
                                fontWeight: 600,
                                fontSize: '16px',
                                transition: 'background 0.2s',
                                minHeight: 52,
                                touchAction: 'manipulation',
                            }}
                        >
                            Schließen
                        </button>
                    </div>
                </div>
            )}
            
            <style jsx global>{`
                @keyframes popIn {
                    from { opacity: 0; transform: scale(0.95) translateY(10px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
                ::-webkit-scrollbar { width: 8px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: #444; border-radius: 4px; }
                ::-webkit-scrollbar-thumb:hover { background: #555; }
                body { 
                    margin: 0; 
                    padding: 0; 
                    overflow: hidden; 
                    -webkit-touch-callout: none;
                    -webkit-user-select: none;
                    touch-action: manipulation;
                }
                * {
                    -webkit-tap-highlight-color: transparent;
                }
            `}</style>
        </div>
    );
}

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

function MonthView({ date, events, onEventClick, theme }: { date: Date; events: CalendarEvent[], onEventClick: (e: CalendarEvent) => void, theme: Theme }) {
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
    const isDark = theme.bg === themes.dark.bg;

    return (
        <div style={{ height: '100%', position: 'relative', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <div style={{ display: 'flex', height: 44, flexShrink: 0, alignItems: 'center', borderBottom: `1px solid ${theme.grid}`, color: theme.textDim, fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>
                {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => (
                    <div key={d} style={{ flex: 1, textAlign: 'center' }}>{d}</div>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: `repeat(7, 1fr)`, flex: 1 }}>
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
                    }).slice(0, 4);

                    return (
                        <div key={i} style={{
                            borderRight: `1px solid ${theme.grid}`,
                            borderBottom: `1px solid ${theme.grid}`,
                            background: isToday ? theme.todayBg : (isCurrentMonth ? 'transparent' : (isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)')),
                            padding: '6px',
                            overflow: 'hidden',
                            opacity: isCurrentMonth ? 1 : 0.5
                        }}>
                            <div style={{
                                textAlign: 'center',
                                marginBottom: '6px',
                                color: isToday ? '#fff' : (isCurrentMonth ? theme.textDim : (isDark ? '#4B5563' : '#94a3b8')),
                                fontWeight: isToday ? 'bold' : 'normal',
                                background: isToday ? theme.accent : 'transparent',
                                width: 28,
                                height: 28,
                                lineHeight: '28px',
                                borderRadius: '50%',
                                margin: '0 auto 6px auto',
                                fontSize: '14px'
                            }}>
                                {d.getDate()}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {dayEvents.map(e => (
                                    <div
                                        key={e.id}
                                        onClick={(ev) => { ev.stopPropagation(); onEventClick(e); }}
                                        style={{
                                            background: isDark ? (e.color + '40') : (e.color + '20'),
                                            borderLeft: `3px solid ${e.color}`,
                                            fontSize: '12px',
                                            color: isDark ? '#eee' : '#1e293b',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            borderRadius: '3px',
                                            padding: '4px 6px',
                                            cursor: 'pointer',
                                            fontWeight: 500,
                                            minHeight: 24,
                                            touchAction: 'manipulation',
                                        }}>
                                        {e.title}
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
            <div style={{ height: 70, flexShrink: 0 }}></div>
        </div>
    )
}

function WeekView({ date, events, onEventClick, theme }: { date: Date; events: CalendarEvent[], onEventClick: (e: CalendarEvent) => void, theme: Theme }) {
    const today = new Date();
    const weekStart = new Date(date);
    const day = weekStart.getDay();
    const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
    weekStart.setDate(diff);

    const leftMargin = 56;
    const startHour = 7;
    const endHour = 20;
    const isDark = theme.bg === themes.dark.bg;

    // Pre-compute events for each day to ensure correct assignment
    const eventsByDay: CalendarEvent[][] = Array.from({ length: 7 }, () => []);
    for (const e of events) {
        const start = new Date(e.start);
        const end = new Date(e.end);
        const eventStartDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        const eventEndDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
        const isMultiDay = eventStartDay.getTime() !== eventEndDay.getTime();
        
        for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
            const colDate = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + dayIdx);
            const colDateMidnight = new Date(colDate.getFullYear(), colDate.getMonth(), colDate.getDate());
            
            if (!isMultiDay) {
                // Single-day event: only show on its start day
                if (eventStartDay.getTime() === colDateMidnight.getTime()) {
                    eventsByDay[dayIdx].push(e);
                }
            } else {
                // Multi-day event: show on all overlapping days
                const dayStart = new Date(colDate.getFullYear(), colDate.getMonth(), colDate.getDate(), 0, 0, 0);
                const dayEnd = new Date(colDate.getFullYear(), colDate.getMonth(), colDate.getDate(), 23, 59, 59);
                if (start < dayEnd && end > dayStart) {
                    eventsByDay[dayIdx].push(e);
                }
            }
        }
    }

    return (
        <div style={{ height: '100%', overflowY: 'auto', position: 'relative' }}>
            {/* Header row */}
            <div style={{ display: 'grid', gridTemplateColumns: `${leftMargin}px repeat(7, 1fr)`, borderBottom: `1px solid ${theme.grid}`, position: 'sticky', top: 0, background: theme.bg, zIndex: 5, height: 52 }}>
                <div /> {/* Empty cell for time column */}
                {Array.from({ length: 7 }).map((_, i) => {
                    const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i);
                    const isToday = d.toDateString() === today.toDateString();
                    return (
                        <div key={i} style={{
                            textAlign: 'center',
                            color: isToday ? (isDark ? '#fff' : theme.accent) : theme.textDim,
                            background: isToday ? theme.todayBg : 'transparent',
                            padding: '8px 0',
                            borderRight: `1px solid ${theme.grid}`,
                            fontWeight: 500,
                        }}>
                            <div style={{ fontSize: '12px', textTransform: 'uppercase', opacity: 0.7 }}>{weekdayShort[d.getDay()]}</div>
                            <div style={{ fontSize: '20px', fontWeight: isToday ? 700 : 500 }}>{d.getDate()}</div>
                        </div>
                    );
                })}
            </div>

            {/* Grid: time column + 7 day columns */}
            <div style={{ display: 'grid', gridTemplateColumns: `${leftMargin}px repeat(7, 1fr)`, height: (endHour - startHour + 1) * HOUR_HEIGHT, paddingBottom: 80, position: 'relative' }}>
                {/* Time labels column */}
                <div style={{ position: 'relative' }}>
                    {Array.from({ length: endHour - startHour + 1 }).map((_, i) => (
                        <div key={i} style={{ position: 'absolute', top: i * HOUR_HEIGHT, left: 0, right: 0, height: HOUR_HEIGHT }}>
                            <span style={{ position: 'absolute', left: 10, top: -9, color: theme.textDim, fontSize: '12px', fontWeight: 500 }}>{startHour + i}</span>
                        </div>
                    ))}
                </div>

                {/* Day columns */}
                {Array.from({ length: 7 }).map((_, dayIdx) => {
                    const dayEvents = eventsByDay[dayIdx];
                    const layout = computeEventLayout(dayEvents);
                    const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + dayIdx);
                    const isToday = d.toDateString() === today.toDateString();

                    return (
                        <div key={dayIdx} style={{ position: 'relative', borderLeft: `1px solid ${theme.grid}` }}>
                            {/* Hour grid lines */}
                            {Array.from({ length: endHour - startHour + 1 }).map((_, i) => (
                                <div key={i} style={{ position: 'absolute', top: i * HOUR_HEIGHT, left: 0, right: 0, borderTop: `1px solid ${theme.grid}`, height: HOUR_HEIGHT, pointerEvents: 'none' }} />
                            ))}

                            {/* Events for this day */}
                            {dayEvents.map(e => {
                                const start = new Date(e.start);
                                const end = new Date(e.end);
                                let startH = start.getHours() + start.getMinutes() / 60;
                                let endH = end.getHours() + end.getMinutes() / 60;
                                if (startH < startHour) startH = startHour;
                                if (endH > endHour) endH = endHour;

                                const top = (startH - startHour) * HOUR_HEIGHT;
                                const height = (endH - startH) * HOUR_HEIGHT;
                                if (height <= 0) return null;

                                const showLoc = height > 40 && e.location;
                                const { left: layoutLeft, width: layoutWidth } = layout.get(e.id) || { left: 0, width: 100 };

                                return (
                                    <div
                                        key={e.id}
                                        onClick={(ev) => { ev.stopPropagation(); onEventClick(e); }}
                                        style={{
                                            position: 'absolute',
                                            boxSizing: 'border-box',
                                            left: `calc(${layoutLeft}% + 2px)`,
                                            width: `calc(${layoutWidth}% - 4px)`,
                                            top: top + 1,
                                            height: height - 2,
                                            background: e.color,
                                            borderRadius: '8px',
                                            padding: '6px 8px',
                                            color: '#fff',
                                            fontSize: '12px',
                                            overflow: 'hidden',
                                            cursor: 'pointer',
                                            zIndex: 1,
                                            boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                                            border: '1px solid rgba(255,255,255,0.2)',
                                            minWidth: 30,
                                            touchAction: 'manipulation',
                                        }}>
                                        <div style={{ fontWeight: 600 }}>{e.title}</div>
                                        {showLoc && (
                                            <div style={{ marginTop: '3px', fontSize: '11px', opacity: 0.9, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                                📍{formatLocation(e.location)}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {/* Current time indicator for today */}
                            {isToday && (() => {
                                const now = new Date();
                                const nowH = now.getHours() + now.getMinutes() / 60;
                                if (nowH >= startHour && nowH <= endHour) {
                                    return (
                                        <div style={{
                                            position: 'absolute',
                                            top: (nowH - startHour) * HOUR_HEIGHT,
                                            left: 0,
                                            right: 0,
                                            height: 2,
                                            background: '#f43f5e',
                                            zIndex: 10,
                                            pointerEvents: 'none'
                                        }}>
                                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f43f5e', marginTop: -4, marginLeft: -5 }} />
                                        </div>
                                    );
                                }
                                return null;
                            })()}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function DayView({ date, events, onEventClick, theme }: { date: Date; events: CalendarEvent[], onEventClick: (e: CalendarEvent) => void, theme: Theme }) {
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    const isDark = theme.bg === themes.dark.bg;

    const hourH = HOUR_HEIGHT;
    const leftMargin = 80;
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
            <div style={{ padding: '14px 0 14px 80px', color: isToday ? (isDark ? '#fff' : theme.accent) : theme.text, fontSize: '26px', fontWeight: 300 }}>
                <span style={{ fontWeight: 700 }}>{dateFormatter.format(date)}</span>
                {isToday && <span style={{ marginLeft: '12px', fontSize: '15px', background: theme.accent, color: '#fff', padding: '4px 12px', borderRadius: '12px', verticalAlign: 'middle', fontWeight: 600 }}>HEUTE</span>}
            </div>

            {/* Grid layout: time column + events column */}
            <div style={{ display: 'grid', gridTemplateColumns: `${leftMargin}px 1fr`, height: (endHour - startHour + 1) * hourH, paddingBottom: 80, paddingRight: 20 }}>
                {/* Time labels column */}
                <div style={{ position: 'relative' }}>
                    {Array.from({ length: endHour - startHour + 1 }).map((_, i) => (
                        <div key={i} style={{ position: 'absolute', top: i * hourH, left: 0, right: 0, height: hourH }}>
                            <span style={{ position: 'absolute', left: 18, top: -12, color: theme.textDim, fontSize: '15px', fontWeight: 500 }}>{startHour + i}:00</span>
                        </div>
                    ))}
                </div>

                {/* Events column */}
                <div style={{ position: 'relative' }}>
                    {/* Hour grid lines */}
                    {Array.from({ length: endHour - startHour + 1 }).map((_, i) => (
                        <div key={i} style={{ position: 'absolute', top: i * hourH, left: 0, right: 0, borderTop: `1px solid ${theme.grid}`, height: hourH, pointerEvents: 'none' }} />
                    ))}

                    {/* Events */}
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

                        const showLoc = height > 70 && e.location;
                        const { left, width } = layout.get(e.id) || { left: 0, width: 100 };

                        return (
                            <div
                                key={e.id}
                                onClick={(ev) => { ev.stopPropagation(); onEventClick(e); }}
                                style={{
                                    position: 'absolute',
                                    left: `calc(${left}% + 4px)`,
                                    width: `calc(${width}% - 8px)`,
                                    top: top,
                                    height: height,
                                    background: e.color,
                                    borderRadius: '10px',
                                    padding: '10px 14px',
                                    color: '#fff',
                                    overflow: 'hidden',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                                    borderLeft: '5px solid rgba(0,0,0,0.2)',
                                    touchAction: 'manipulation',
                                    boxSizing: 'border-box',
                                }}>
                                <div style={{ fontWeight: 700, fontSize: '16px' }}>{e.title}</div>
                                <div style={{ fontSize: '14px', opacity: 0.9, marginTop: '4px' }}>
                                    {timeFormatter.format(start)} - {timeFormatter.format(end)}
                                </div>
                                {showLoc && (
                                    <div style={{ fontSize: '14px', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span>📍</span>
                                        <span style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                            {formatLocation(e.location)}
                                        </span>
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* Current time indicator for today */}
                    {isToday && (() => {
                        const now = new Date();
                        const nowH = now.getHours() + now.getMinutes() / 60;
                        if (nowH >= startHour && nowH <= endHour) {
                            return (
                                <div style={{
                                    position: 'absolute',
                                    top: (nowH - startHour) * hourH,
                                    left: 0,
                                    right: 0,
                                    height: 2,
                                    background: '#f43f5e',
                                    zIndex: 10,
                                    pointerEvents: 'none'
                                }}>
                                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f43f5e', marginTop: -4, marginLeft: -5 }} />
                                </div>
                            );
                        }
                        return null;
                    })()}
                </div>
            </div>
        </div>
    );
}
