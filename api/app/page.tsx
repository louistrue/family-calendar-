export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>Family Calendar API</h1>
      <p>
        API endpoint: <code>/api/calendar</code>
      </p>
      <h2>Usage</h2>
      <pre
        style={{
          background: '#f5f5f5',
          padding: '1rem',
          borderRadius: '4px',
        }}
      >
        {`GET /api/calendar
GET /api/calendar?from=2024-01-01&to=2024-01-31`}
      </pre>
      <h2>Response</h2>
      <pre
        style={{
          background: '#f5f5f5',
          padding: '1rem',
          borderRadius: '4px',
        }}
      >
        {`{
  "calendars": [
    { "name": "Work", "color": "#3B82F6" },
    ...
  ],
  "events": [
    {
      "id": "...",
      "title": "Meeting",
      "start": "2024-01-15T09:00:00Z",
      "end": "2024-01-15T10:00:00Z",
      "allDay": false,
      "calendar": "Work",
      "color": "#3B82F6"
    },
    ...
  ],
  "fetchedAt": "2024-01-15T08:00:00Z"
}`}
      </pre>
    </main>
  );
}
