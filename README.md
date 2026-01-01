# Family Calendar Display

A beautiful family calendar display for Makerfabs ESP32-S3 7" touchscreen (1024x600).

Aggregates multiple calendars (Google, Outlook, iCloud) and displays them color-coded with day/week/month views.

```
┌────────────────────────────────────────────────────┐
│  ◀   January 2026                [DAY][WEEK][MON] │
├────────┬────────┬────────┬────────┬────────┬──────┤
│  Mon   │  Tue   │  Wed   │  Thu   │  Fri   │ Sat  │
│   5    │   6    │   7    │   8    │   9    │  10  │
├────────┼────────┼────────┼────────┼────────┼──────┤
│████████│        │████████│        │████████│      │
│Meeting │        │Dentist │        │Date    │      │
│  9am   │        │  2pm   │        │ night  │      │
└────────┴────────┴────────┴────────┴────────┴──────┘
  🔵 Work    🟢 Personal    🩷 Sarah    🟠 Family
```

## Features

- **4 calendars** - color-coded (blue, green, pink, orange)
- **3 views** - Day, Week, Month (touch to switch)
- **Touch navigation** - tap arrows to navigate dates
- **Auto-refresh** - updates every 5 minutes
- **Today highlight** - current day stands out
- **Current time indicator** - red line in day/week views

## Project Structure

```
family-calendar/
├── api/                          # Vercel backend
│   ├── app/api/calendar/route.ts # ICS aggregation API
│   ├── package.json
│   └── .env.example              # Calendar URL template
├── esp32/                        # Display firmware
│   ├── src/
│   │   ├── main.cpp              # Main firmware
│   │   ├── lgfx_config.h         # Display pin configuration
│   │   └── secrets.h.example     # WiFi + API config template
│   └── platformio.ini
└── README.md
```

## Quick Start

### 1. Get Calendar ICS URLs

| Source | Where to find |
|--------|---------------|
| **Google Calendar** | Settings → Your Calendar → "Secret address in iCal format" |
| **Outlook** | Settings → Calendar → Shared calendars → Publish → ICS link |
| **Apple iCloud** | Calendar app → Share → Public Calendar → Copy link |

### 2. Deploy API to Vercel

```bash
cd api
npm install

# Deploy to Vercel
npx vercel

# Add environment variables in Vercel dashboard:
# CAL_1_URL, CAL_1_NAME, CAL_1_COLOR
# CAL_2_URL, CAL_2_NAME, CAL_2_COLOR
# CAL_3_URL, CAL_3_NAME, CAL_3_COLOR
# CAL_4_URL, CAL_4_NAME, CAL_4_COLOR
```

### 3. Configure ESP32

```bash
cd esp32/src

# Copy and edit secrets file
cp secrets.h.example secrets.h
```

Edit `secrets.h`:
```cpp
#define WIFI_SSID     "YourWiFi"
#define WIFI_PASSWORD "YourPassword"
#define API_URL       "https://your-app.vercel.app/api/calendar"
#define GMT_OFFSET    -8  // Your timezone offset from GMT
```

### 4. Flash ESP32

```bash
cd esp32

# Using PlatformIO
pio run -t upload

# Monitor serial output
pio device monitor
```

## Hardware

- **Display**: Makerfabs MaTouch ESP32-S3 7" IPS (1024x600)
- [Product page](https://www.makerfabs.com/esp32-s3-parallel-tft-with-touch-7-inch.html)

### Pin Configuration

The `lgfx_config.h` is configured for the standard Makerfabs 7" board. If you have a different revision, check the [Makerfabs wiki](https://wiki.makerfabs.com/) and adjust pins accordingly.

Key pins:
- **I2C Touch (GT911)**: SDA=17, SCL=18, INT=2
- **RGB Panel**: 16-bit parallel interface

## API Endpoints

### GET /api/calendar

Fetches all calendar events.

**Query Parameters:**
- `from` (optional): Start date (ISO 8601)
- `to` (optional): End date (ISO 8601)

**Response:**
```json
{
  "calendars": [
    { "name": "Work", "color": "#3B82F6" }
  ],
  "events": [
    {
      "id": "abc123",
      "title": "Team Meeting",
      "start": "2026-01-15T09:00:00Z",
      "end": "2026-01-15T10:00:00Z",
      "allDay": false,
      "calendar": "Work",
      "color": "#3B82F6",
      "location": "Conference Room A"
    }
  ],
  "fetchedAt": "2026-01-15T08:00:00Z"
}
```

## Customization

### Colors

Edit calendar colors in your Vercel environment variables:
- `CAL_1_COLOR=#3B82F6` (blue)
- `CAL_2_COLOR=#22C55E` (green)
- `CAL_3_COLOR=#EC4899` (pink)
- `CAL_4_COLOR=#F97316` (orange)

### Display Theme

Edit colors in `main.cpp`:
```cpp
#define COLOR_BG        0x1084  // Background
#define COLOR_HEADER    0x2104  // Header bar
#define COLOR_TODAY     0x4208  // Today highlight
#define COLOR_TEXT      0xFFFF  // Text color
#define COLOR_NOW       0xF800  // Current time indicator
```

### Refresh Interval

In `secrets.h`:
```cpp
#define REFRESH_INTERVAL 300000  // 5 minutes in milliseconds
```

## Troubleshooting

### Display is blank or shows garbage
- Check `lgfx_config.h` pins match your board
- Verify power supply (some boards need 5V via USB-C)

### Touch not working
- Verify I2C pins (SDA/SCL) in `lgfx_config.h`
- Check GT911 I2C address (usually 0x5D or 0x14)

### WiFi connection fails
- Verify credentials in `secrets.h`
- Check signal strength (ESP32 needs reasonable signal)

### Events not loading
- Test API URL in browser first
- Check Vercel logs for errors
- Verify ICS URLs are accessible

## License

MIT
