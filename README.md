# Family Calendar Display

A beautiful family calendar display for Makerfabs ESP32-S3 7" touchscreen (1024x600).

Aggregates multiple calendars (Google, Outlook, iCloud) and displays them color-coded with day/week/month views.

![Preview](docs/preview.png)

## Features

- **4 calendars** - color-coded (blue, cyan, magenta, yellow)
- **3 views** - Day, Week, Month (touch to switch)
- **Touch navigation** - tap arrows to navigate dates, tap days to drill down
- **Auto-refresh** - updates every 5 minutes
- **Today highlight** - current day stands out
- **Current time indicator** - red line in day view

## Hardware

- [Makerfabs MaTouch ESP32-S3 7" IPS](https://www.makerfabs.com/esp32-s3-parallel-tft-with-touch-7-inch.html) (1024x600)
- USB-C cable for power and programming

## Quick Start

### 1. Get Calendar ICS URLs

**Google Calendar:**
1. Go to [Google Calendar Settings](https://calendar.google.com/calendar/r/settings)
2. Select your calendar
3. Scroll to "Secret address in iCal format"
4. Copy the URL

**Outlook/Microsoft 365:**
1. Go to Calendar settings
2. Shared calendars → Publish a calendar
3. Select calendar and permissions
4. Copy the ICS link

**iCloud:**
1. In Calendar app, right-click calendar
2. Share Calendar → Public Calendar
3. Copy the link

### 2. Deploy API to Vercel (Recommended)

The API acts as a proxy to fetch calendars, avoiding SSL/CORS issues on ESP32.

```bash
cd api
npm install

# Set environment variables in Vercel dashboard or .env.local:
# CAL_1_URL, CAL_2_URL, CAL_3_URL, CAL_4_URL

npx vercel
```

After deployment, your calendar URLs will be:
- `https://your-app.vercel.app/api/calendar?id=1`
- `https://your-app.vercel.app/api/calendar?id=2`
- `https://your-app.vercel.app/api/calendar?id=3`
- `https://your-app.vercel.app/api/calendar?id=4`

### 3. Configure ESP32

Edit `esp32/include/secrets.h`:

```cpp
#define WIFI_SSID     "your_wifi_ssid"
#define WIFI_PASSWORD "your_wifi_password"

// Use your Vercel API URLs:
#define ICS_URL_1 "https://your-app.vercel.app/api/calendar?id=1"
#define ICS_URL_2 "https://your-app.vercel.app/api/calendar?id=2"
#define ICS_URL_3 "https://your-app.vercel.app/api/calendar?id=3"
#define ICS_URL_4 "https://your-app.vercel.app/api/calendar?id=4"

// Timezone (seconds from UTC)
#define TIMEZONE_OFFSET 3600   // CET = UTC+1
#define DAYLIGHT_OFFSET 3600   // Additional for summer time
```

### 4. Flash ESP32

```bash
cd esp32

# Install PlatformIO if needed
pip install platformio

# Build and upload
pio run -t upload

# Monitor serial output
pio device monitor
```

## Project Structure

```
family-calendar/
├── esp32/
│   ├── include/
│   │   ├── lgfx_config.h    # Display pin configuration
│   │   └── secrets.h        # WiFi & calendar URLs
│   ├── src/
│   │   └── main.cpp         # Main application
│   └── platformio.ini       # Build configuration
├── api/
│   ├── api/
│   │   ├── calendar.js      # Calendar proxy endpoint
│   │   └── health.js        # Health check endpoint
│   ├── package.json
│   └── vercel.json
└── README.md
```

## Customization

### Calendar Names & Colors

Edit in `esp32/src/main.cpp`:

```cpp
const uint16_t CAL_COLORS[] = {
    0x54BF,  // Blue
    0x07FF,  // Cyan
    0xF81F,  // Magenta
    0xFBE0   // Yellow
};

const char* CAL_NAMES[] = {
    "Louis Work",
    "Louis Personal",
    "Sarah Work",
    "Sarah Personal"
};
```

### Display Pins

If using a different Makerfabs board variant, check `esp32/include/lgfx_config.h` and update the GPIO pin mappings.

### Refresh Interval

Change in `esp32/src/main.cpp`:

```cpp
const unsigned long REFRESH_INTERVAL = 5 * 60 * 1000;  // 5 minutes
```

## Troubleshooting

### Display shows nothing
- Check `lgfx_config.h` pin mappings match your board
- Verify backlight pin (GPIO 2) is correct
- Check serial output for errors

### WiFi won't connect
- Verify SSID and password in `secrets.h`
- Ensure 2.4GHz network (ESP32 doesn't support 5GHz)

### Calendars not loading
- Check API health: `https://your-app.vercel.app/api/health`
- Verify environment variables are set in Vercel
- Check serial output for HTTP error codes

### Time is wrong
- Adjust `TIMEZONE_OFFSET` and `DAYLIGHT_OFFSET` in `secrets.h`
- Ensure NTP servers are accessible

## License

MIT License - see [LICENSE](LICENSE)
