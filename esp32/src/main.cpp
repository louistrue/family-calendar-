/**
 * Family Calendar for Makerfabs ESP32-S3 7" Display
 * 1024x600 resolution, touch navigation
 *
 * Features:
 * - 4 calendar ICS feeds
 * - Day / Week / Month views
 * - Touch to switch views and navigate
 * - Color-coded per calendar
 * - Current time indicator
 * - Auto-refresh every 5 minutes
 */

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <time.h>
#include <vector>
#include <algorithm>

#define LGFX_USE_V1
#include <LovyanGFX.hpp>
#include "lgfx_config.h"
#include "secrets.h"

// ============================================================================
// Display & Touch Setup
// ============================================================================
static LGFX lcd;

#define SCREEN_W 1024
#define SCREEN_H 600

// ============================================================================
// Colors (RGB565)
// ============================================================================
#define COLOR_BG          0x1082  // Dark blue-gray
#define COLOR_CARD        0x2945  // Card background
#define COLOR_TEXT        0xFFFF  // White
#define COLOR_DIM         0x7BEF  // Gray
#define COLOR_TODAY       0x4A69  // Highlight today
#define COLOR_HEADER      0x18E3  // Header bar
#define COLOR_TIME_LINE   0xF800  // Red for current time indicator

// Calendar colors (4 calendars)
const uint16_t CAL_COLORS[] = {
    0x54BF,  // Blue (Calendar 1)
    0x07FF,  // Cyan (Calendar 2)
    0xF81F,  // Magenta (Calendar 3)
    0xFBE0   // Yellow (Calendar 4)
};

const char* CAL_NAMES[] = {
    "Louis Work",
    "Louis Personal",
    "Sarah Work",
    "Sarah Personal"
};

// ============================================================================
// Event Structure
// ============================================================================
struct CalendarEvent {
    String title;
    time_t start;
    time_t end;
    uint8_t calendarId;  // 0-3
    bool allDay;
};

std::vector<CalendarEvent> events;

// ============================================================================
// View State
// ============================================================================
enum ViewMode { VIEW_DAY, VIEW_WEEK, VIEW_MONTH };
ViewMode currentView = VIEW_WEEK;

struct tm viewDate;  // Current date being viewed
bool needsRedraw = true;

// Touch state
unsigned long lastTouch = 0;

// Refresh timer
unsigned long lastRefresh = 0;
const unsigned long REFRESH_INTERVAL = 5 * 60 * 1000;  // 5 minutes

// ============================================================================
// WiFi Connection
// ============================================================================
void connectWiFi() {
    lcd.fillScreen(COLOR_BG);
    lcd.setTextColor(COLOR_TEXT);
    lcd.setTextSize(1);
    lcd.drawCentreString("Connecting to WiFi...", SCREEN_W / 2, SCREEN_H / 2 - 20, 4);

    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 30) {
        delay(500);
        lcd.fillCircle(SCREEN_W / 2 - 50 + (attempts % 10) * 10, SCREEN_H / 2 + 30, 5, COLOR_TEXT);
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        lcd.fillScreen(COLOR_BG);
        lcd.drawCentreString("WiFi Connected!", SCREEN_W / 2, SCREEN_H / 2 - 20, 4);
        lcd.drawCentreString(WiFi.localIP().toString().c_str(), SCREEN_W / 2, SCREEN_H / 2 + 20, 2);
        Serial.printf("WiFi connected: %s\n", WiFi.localIP().toString().c_str());
        delay(1000);
    } else {
        lcd.fillScreen(COLOR_BG);
        lcd.setTextColor(0xF800);  // Red
        lcd.drawCentreString("WiFi Failed!", SCREEN_W / 2, SCREEN_H / 2, 4);
        Serial.println("WiFi connection failed");
        delay(3000);
    }
}

// ============================================================================
// Time Helpers
// ============================================================================
void initTime() {
    configTime(TIMEZONE_OFFSET, DAYLIGHT_OFFSET, "pool.ntp.org", "time.nist.gov");

    struct tm timeinfo;
    int retry = 0;
    while (!getLocalTime(&timeinfo) && retry < 10) {
        delay(500);
        retry++;
    }

    if (retry < 10) {
        Serial.printf("Time initialized: %04d-%02d-%02d %02d:%02d:%02d\n",
                      timeinfo.tm_year + 1900, timeinfo.tm_mon + 1, timeinfo.tm_mday,
                      timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec);
    }

    // Initialize viewDate to today
    getLocalTime(&viewDate);
}

bool isSameDay(struct tm* a, struct tm* b) {
    return a->tm_year == b->tm_year &&
           a->tm_mon == b->tm_mon &&
           a->tm_mday == b->tm_mday;
}

bool isToday(struct tm* date) {
    struct tm now;
    getLocalTime(&now);
    return isSameDay(date, &now);
}

void addDays(struct tm* date, int days) {
    time_t t = mktime(date);
    t += days * 86400;
    localtime_r(&t, date);
}

int getWeekday(struct tm* date) {
    // Returns 0=Monday, 6=Sunday (European style)
    int dow = date->tm_wday;
    return (dow + 6) % 7;
}

void getWeekStart(struct tm* date, struct tm* weekStart) {
    *weekStart = *date;
    int daysSinceMonday = getWeekday(date);
    addDays(weekStart, -daysSinceMonday);
}

// ============================================================================
// ICS Parser
// ============================================================================
void parseICSLine(String& line, String& key, String& value) {
    int colonPos = line.indexOf(':');
    if (colonPos > 0) {
        key = line.substring(0, colonPos);
        value = line.substring(colonPos + 1);
        key.trim();
        value.trim();
    }
}

time_t parseICSDateTime(String& dtStr) {
    // Format: YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ or YYYYMMDD
    struct tm t = {0};

    if (dtStr.length() >= 8) {
        t.tm_year = dtStr.substring(0, 4).toInt() - 1900;
        t.tm_mon = dtStr.substring(4, 6).toInt() - 1;
        t.tm_mday = dtStr.substring(6, 8).toInt();

        if (dtStr.length() >= 15 && dtStr.charAt(8) == 'T') {
            t.tm_hour = dtStr.substring(9, 11).toInt();
            t.tm_min = dtStr.substring(11, 13).toInt();
            t.tm_sec = dtStr.substring(13, 15).toInt();
        }
    }

    return mktime(&t);
}

void fetchCalendar(uint8_t calId, const char* icsUrl) {
    WiFiClientSecure client;
    client.setInsecure();  // Skip certificate verification

    HTTPClient http;
    http.begin(client, icsUrl);
    http.setTimeout(15000);

    int httpCode = http.GET();

    if (httpCode == 200) {
        String payload = http.getString();
        int eventsAdded = 0;

        // Parse ICS
        bool inEvent = false;
        CalendarEvent evt;
        evt.calendarId = calId;
        evt.allDay = false;

        int lineStart = 0;
        while (lineStart < (int)payload.length()) {
            int lineEnd = payload.indexOf('\n', lineStart);
            if (lineEnd < 0) lineEnd = payload.length();

            String line = payload.substring(lineStart, lineEnd);
            line.trim();

            // Handle line continuations (lines starting with space)
            while (lineEnd + 1 < (int)payload.length() &&
                   (payload.charAt(lineEnd + 1) == ' ' || payload.charAt(lineEnd + 1) == '\t')) {
                int nextEnd = payload.indexOf('\n', lineEnd + 1);
                if (nextEnd < 0) nextEnd = payload.length();
                line += payload.substring(lineEnd + 2, nextEnd);
                line.trim();
                lineEnd = nextEnd;
            }

            if (line.startsWith("BEGIN:VEVENT")) {
                inEvent = true;
                evt.title = "";
                evt.start = 0;
                evt.end = 0;
                evt.allDay = false;
            }
            else if (line.startsWith("END:VEVENT")) {
                if (inEvent && evt.title.length() > 0 && evt.start > 0) {
                    // Only keep events from the last 30 days to next 60 days
                    time_t now = time(nullptr);
                    time_t windowStart = now - (30 * 86400);
                    time_t windowEnd = now + (60 * 86400);

                    if (evt.end > windowStart && evt.start < windowEnd) {
                        events.push_back(evt);
                        eventsAdded++;
                    }
                }
                inEvent = false;
            }
            else if (inEvent) {
                String key, value;
                parseICSLine(line, key, value);

                if (key == "SUMMARY") {
                    evt.title = value;
                    // Unescape common ICS escapes
                    evt.title.replace("\\,", ",");
                    evt.title.replace("\\;", ";");
                    evt.title.replace("\\n", " ");
                    evt.title.replace("\\N", " ");
                }
                else if (key.startsWith("DTSTART")) {
                    evt.start = parseICSDateTime(value);
                    if (key.indexOf("VALUE=DATE") > 0 || value.length() == 8) {
                        evt.allDay = true;
                    }
                }
                else if (key.startsWith("DTEND")) {
                    evt.end = parseICSDateTime(value);
                }
            }

            lineStart = lineEnd + 1;
        }

        Serial.printf("Calendar %d: loaded %d events\n", calId, eventsAdded);
    } else {
        Serial.printf("Calendar %d: HTTP error %d\n", calId, httpCode);
    }

    http.end();
}

void fetchAllCalendars() {
    events.clear();

    Serial.println("Fetching calendars...");
    lcd.fillRect(0, SCREEN_H / 2 - 20, SCREEN_W, 40, COLOR_BG);
    lcd.setTextColor(COLOR_DIM);
    lcd.drawCentreString("Syncing calendars...", SCREEN_W / 2, SCREEN_H / 2 - 10, 4);

    fetchCalendar(0, ICS_URL_1);
    yield();  // Let WiFi stack breathe
    fetchCalendar(1, ICS_URL_2);
    yield();
    fetchCalendar(2, ICS_URL_3);
    yield();
    fetchCalendar(3, ICS_URL_4);

    // Sort events by start time
    std::sort(events.begin(), events.end(), [](const CalendarEvent& a, const CalendarEvent& b) {
        return a.start < b.start;
    });

    Serial.printf("Total events loaded: %d\n", events.size());
    lastRefresh = millis();
}

// ============================================================================
// Get Events for Date Range
// ============================================================================
std::vector<CalendarEvent*> getEventsForDay(struct tm* date) {
    std::vector<CalendarEvent*> dayEvents;

    struct tm dayStart = *date;
    dayStart.tm_hour = 0;
    dayStart.tm_min = 0;
    dayStart.tm_sec = 0;
    time_t tDayStart = mktime(&dayStart);
    time_t tDayEnd = tDayStart + 86400;

    for (auto& evt : events) {
        if (evt.start < tDayEnd && evt.end > tDayStart) {
            dayEvents.push_back(&evt);
        }
    }

    return dayEvents;
}

// ============================================================================
// Draw Header
// ============================================================================
void drawHeader() {
    // Header background
    lcd.fillRect(0, 0, SCREEN_W, 60, COLOR_HEADER);

    // Navigation arrows
    lcd.setTextColor(COLOR_TEXT);
    lcd.setTextSize(1);
    lcd.drawString("<", 20, 18, 4);
    lcd.drawString(">", SCREEN_W - 40, 18, 4);

    // Title based on view
    char title[64];
    const char* months[] = {"January", "February", "March", "April", "May", "June",
                            "July", "August", "September", "October", "November", "December"};

    switch (currentView) {
        case VIEW_DAY:
            sprintf(title, "%s %d, %d", months[viewDate.tm_mon], viewDate.tm_mday, viewDate.tm_year + 1900);
            break;
        case VIEW_WEEK:
        case VIEW_MONTH:
            sprintf(title, "%s %d", months[viewDate.tm_mon], viewDate.tm_year + 1900);
            break;
    }

    lcd.drawCentreString(title, SCREEN_W / 2, 15, 4);

    // View mode buttons
    int btnY = 8;
    int btnW = 80;
    int btnH = 40;
    int btnStart = SCREEN_W - 280;

    // Day button
    lcd.fillRoundRect(btnStart, btnY, btnW, btnH, 5, currentView == VIEW_DAY ? COLOR_TEXT : COLOR_CARD);
    lcd.setTextColor(currentView == VIEW_DAY ? COLOR_HEADER : COLOR_TEXT);
    lcd.drawCentreString("Day", btnStart + btnW / 2, btnY + 10, 2);

    // Week button
    lcd.fillRoundRect(btnStart + 90, btnY, btnW, btnH, 5, currentView == VIEW_WEEK ? COLOR_TEXT : COLOR_CARD);
    lcd.setTextColor(currentView == VIEW_WEEK ? COLOR_HEADER : COLOR_TEXT);
    lcd.drawCentreString("Week", btnStart + 90 + btnW / 2, btnY + 10, 2);

    // Month button
    lcd.fillRoundRect(btnStart + 180, btnY, btnW, btnH, 5, currentView == VIEW_MONTH ? COLOR_TEXT : COLOR_CARD);
    lcd.setTextColor(currentView == VIEW_MONTH ? COLOR_HEADER : COLOR_TEXT);
    lcd.drawCentreString("Month", btnStart + 180 + btnW / 2, btnY + 10, 2);
}

// ============================================================================
// Draw Legend
// ============================================================================
void drawLegend() {
    int y = SCREEN_H - 35;
    int x = 20;

    lcd.fillRect(0, y - 5, SCREEN_W, 40, COLOR_HEADER);

    for (int i = 0; i < 4; i++) {
        lcd.fillCircle(x, y + 12, 8, CAL_COLORS[i]);
        lcd.setTextColor(COLOR_TEXT);
        lcd.drawString(CAL_NAMES[i], x + 15, y + 5, 2);
        x += 240;
    }
}

// ============================================================================
// Draw Current Time Indicator
// ============================================================================
void drawTimeIndicator(int contentY, int contentH, int startHour, int endHour) {
    struct tm now;
    getLocalTime(&now);

    if (now.tm_hour >= startHour && now.tm_hour <= endHour) {
        int slotH = contentH / (endHour - startHour + 1);
        int y = contentY + (now.tm_hour - startHour) * slotH + (now.tm_min * slotH / 60);

        lcd.drawFastHLine(60, y, SCREEN_W - 80, COLOR_TIME_LINE);
        lcd.fillCircle(60, y, 5, COLOR_TIME_LINE);
    }
}

// ============================================================================
// Draw Day View
// ============================================================================
void drawDayView() {
    int contentY = 70;
    int contentH = SCREEN_H - 110;  // Leave room for legend
    int allDayH = 35;

    lcd.fillRect(0, contentY, SCREEN_W, contentH, COLOR_BG);

    // Get events for this day
    auto dayEvents = getEventsForDay(&viewDate);

    // All-day events section
    int allDayCount = 0;
    for (auto* evt : dayEvents) {
        if (evt->allDay) allDayCount++;
    }

    int timeStartY = contentY;
    if (allDayCount > 0) {
        lcd.fillRect(0, contentY, SCREEN_W, allDayH, COLOR_CARD);
        lcd.setTextColor(COLOR_DIM);
        lcd.drawString("All Day", 10, contentY + 8, 2);

        int adX = 80;
        for (auto* evt : dayEvents) {
            if (evt->allDay && adX < SCREEN_W - 100) {
                int w = min((int)(evt->title.length() * 8 + 10), 200);
                lcd.fillRoundRect(adX, contentY + 5, w, 25, 4, CAL_COLORS[evt->calendarId]);
                lcd.setTextColor(COLOR_TEXT);
                String title = evt->title.substring(0, 24);
                lcd.drawString(title, adX + 5, contentY + 9, 2);
                adX += w + 5;
            }
        }
        timeStartY = contentY + allDayH;
    }

    // Time slots (6am - 10pm)
    int timeAreaH = SCREEN_H - 110 - (allDayCount > 0 ? allDayH : 0);
    int slotH = timeAreaH / 17;  // 17 hours (6-22)

    for (int hour = 6; hour <= 22; hour++) {
        int y = timeStartY + (hour - 6) * slotH;

        // Hour label
        char timeStr[8];
        sprintf(timeStr, "%02d:00", hour);
        lcd.setTextColor(COLOR_DIM);
        lcd.drawString(timeStr, 10, y + 2, 2);

        // Grid line
        lcd.drawFastHLine(70, y, SCREEN_W - 90, COLOR_CARD);
    }

    // Draw timed events
    int eventX = 80;
    int eventW = SCREEN_W - 100;

    for (auto* evt : dayEvents) {
        if (evt->allDay) continue;

        struct tm evtTime;
        localtime_r(&evt->start, &evtTime);

        int startHour = evtTime.tm_hour;
        int startMin = evtTime.tm_min;

        struct tm evtEndTime;
        localtime_r(&evt->end, &evtEndTime);
        int endHour = evtEndTime.tm_hour;
        int endMin = evtEndTime.tm_min;

        if (startHour >= 6 && startHour <= 22) {
            int y1 = timeStartY + (startHour - 6) * slotH + (startMin * slotH / 60);
            int y2 = timeStartY + (endHour - 6) * slotH + (endMin * slotH / 60);
            int h = max(y2 - y1, 22);

            // Clamp to visible area
            if (y1 < timeStartY) y1 = timeStartY;
            if (y1 + h > SCREEN_H - 45) h = SCREEN_H - 45 - y1;

            lcd.fillRoundRect(eventX, y1, eventW, h, 4, CAL_COLORS[evt->calendarId]);
            lcd.setTextColor(COLOR_TEXT);

            String label = evt->title;
            if (label.length() > 40) label = label.substring(0, 38) + "..";

            // Add time to label if space permits
            if (h > 35) {
                char timeLabel[16];
                sprintf(timeLabel, "%02d:%02d", startHour, startMin);
                lcd.drawString(timeLabel, eventX + 5, y1 + 3, 1);
                lcd.drawString(label, eventX + 5, y1 + 15, 2);
            } else {
                lcd.drawString(label, eventX + 5, y1 + 3, 2);
            }
        }
    }

    // Draw current time indicator
    drawTimeIndicator(timeStartY, timeAreaH, 6, 22);
}

// ============================================================================
// Draw Week View
// ============================================================================
void drawWeekView() {
    int contentY = 70;
    int contentH = SCREEN_H - 110;
    int colW = (SCREEN_W - 60) / 7;
    int headerH = 40;

    lcd.fillRect(0, contentY, SCREEN_W, contentH, COLOR_BG);

    // Get week start (Monday)
    struct tm weekStart;
    getWeekStart(&viewDate, &weekStart);

    const char* dayNames[] = {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"};

    // Draw columns for each day
    for (int d = 0; d < 7; d++) {
        struct tm day = weekStart;
        addDays(&day, d);

        int x = 60 + d * colW;

        // Day header
        uint16_t headerBg = isToday(&day) ? COLOR_TODAY : COLOR_CARD;
        lcd.fillRect(x, contentY, colW - 2, headerH, headerBg);

        char dayLabel[16];
        sprintf(dayLabel, "%s %d", dayNames[d], day.tm_mday);
        lcd.setTextColor(COLOR_TEXT);
        lcd.drawCentreString(dayLabel, x + colW / 2, contentY + 10, 2);

        // Events for this day
        auto dayEvents = getEventsForDay(&day);
        int eventY = contentY + headerH + 5;
        int maxEvents = (contentH - headerH - 10) / 28;
        int count = 0;

        for (auto* evt : dayEvents) {
            if (count >= maxEvents - 1) {
                int remaining = dayEvents.size() - count;
                if (remaining > 0) {
                    lcd.setTextColor(COLOR_DIM);
                    char moreStr[16];
                    sprintf(moreStr, "+%d more", remaining);
                    lcd.drawCentreString(moreStr, x + colW / 2, eventY, 1);
                }
                break;
            }

            // Event bar
            lcd.fillRoundRect(x + 2, eventY, colW - 6, 24, 3, CAL_COLORS[evt->calendarId]);

            // Event title (truncated)
            String title = evt->title;
            int maxChars = (colW - 10) / 7;  // Approximate char width
            if ((int)title.length() > maxChars) {
                title = title.substring(0, maxChars - 2) + "..";
            }
            lcd.setTextColor(COLOR_TEXT);
            lcd.drawString(title, x + 5, eventY + 5, 1);

            eventY += 28;
            count++;
        }
    }

    // Time column label
    lcd.setTextColor(COLOR_DIM);
    lcd.drawCentreString("Week", 30, contentY + 10, 1);

    // Current day indicator line
    struct tm now;
    getLocalTime(&now);
    int todayOffset = getWeekday(&now);
    struct tm thisWeekStart;
    getWeekStart(&now, &thisWeekStart);

    if (isSameDay(&thisWeekStart, &weekStart)) {
        int todayX = 60 + todayOffset * colW + colW / 2;
        lcd.drawFastVLine(todayX, contentY + headerH, contentH - headerH - 10, COLOR_TIME_LINE);
    }
}

// ============================================================================
// Draw Month View
// ============================================================================
void drawMonthView() {
    int contentY = 70;
    int contentH = SCREEN_H - 110;
    int cellW = SCREEN_W / 7;
    int headerH = 30;
    int cellH = (contentH - headerH) / 6;  // 6 weeks max

    lcd.fillRect(0, contentY, SCREEN_W, contentH, COLOR_BG);

    // Day headers
    const char* dayNames[] = {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"};
    for (int d = 0; d < 7; d++) {
        lcd.setTextColor(COLOR_DIM);
        lcd.drawCentreString(dayNames[d], d * cellW + cellW / 2, contentY + 5, 2);
    }

    // Find first day of month
    struct tm firstDay = viewDate;
    firstDay.tm_mday = 1;
    firstDay.tm_hour = 12;  // Avoid DST issues
    mktime(&firstDay);  // Normalize

    int startDow = getWeekday(&firstDay);  // 0=Mon

    // Days in month
    struct tm nextMonth = firstDay;
    nextMonth.tm_mon++;
    mktime(&nextMonth);
    time_t diff = mktime(&nextMonth) - mktime(&firstDay);
    int daysInMonth = diff / 86400;

    // Draw grid
    int day = 1;
    for (int week = 0; week < 6; week++) {
        for (int dow = 0; dow < 7; dow++) {
            int x = dow * cellW;
            int y = contentY + headerH + week * cellH;

            if ((week == 0 && dow < startDow) || day > daysInMonth) {
                // Empty cell
                lcd.fillRect(x, y, cellW - 1, cellH - 1, COLOR_CARD);
            } else {
                // Day cell
                struct tm thisDay = firstDay;
                thisDay.tm_mday = day;
                mktime(&thisDay);

                uint16_t cellBg = isToday(&thisDay) ? COLOR_TODAY : COLOR_BG;
                lcd.fillRect(x, y, cellW - 1, cellH - 1, cellBg);
                lcd.drawRect(x, y, cellW - 1, cellH - 1, COLOR_CARD);

                // Day number
                char dayNum[4];
                sprintf(dayNum, "%d", day);
                lcd.setTextColor(COLOR_TEXT);
                lcd.drawString(dayNum, x + 5, y + 3, 2);

                // Event indicators
                auto dayEvents = getEventsForDay(&thisDay);
                int dotX = x + 5;
                int dotY = y + cellH - 15;
                int dotCount = 0;

                // Show unique calendar colors for this day
                bool shown[4] = {false, false, false, false};
                for (auto* evt : dayEvents) {
                    if (!shown[evt->calendarId] && dotCount < 6) {
                        lcd.fillCircle(dotX, dotY, 4, CAL_COLORS[evt->calendarId]);
                        shown[evt->calendarId] = true;
                        dotX += 12;
                        dotCount++;
                    }
                }

                // Show event count if many events
                if (dayEvents.size() > 4) {
                    char countStr[8];
                    sprintf(countStr, "+%d", (int)dayEvents.size());
                    lcd.setTextColor(COLOR_DIM);
                    lcd.drawString(countStr, x + cellW - 25, y + 3, 1);
                }

                day++;
            }
        }
        if (day > daysInMonth) break;
    }
}

// ============================================================================
// Draw Screen
// ============================================================================
void draw() {
    lcd.fillScreen(COLOR_BG);

    drawHeader();

    switch (currentView) {
        case VIEW_DAY:
            drawDayView();
            break;
        case VIEW_WEEK:
            drawWeekView();
            break;
        case VIEW_MONTH:
            drawMonthView();
            break;
    }

    drawLegend();

    needsRedraw = false;
}

// ============================================================================
// Touch Handling
// ============================================================================
void handleTouch() {
    uint16_t x, y;
    if (lcd.getTouch(&x, &y)) {
        if (millis() - lastTouch < 300) return;  // Debounce
        lastTouch = millis();

        Serial.printf("Touch: %d, %d\n", x, y);

        // Header navigation (y < 60)
        if (y < 60) {
            // Left arrow - previous
            if (x < 60) {
                switch (currentView) {
                    case VIEW_DAY:
                        addDays(&viewDate, -1);
                        break;
                    case VIEW_WEEK:
                        addDays(&viewDate, -7);
                        break;
                    case VIEW_MONTH:
                        viewDate.tm_mon--;
                        mktime(&viewDate);
                        break;
                }
                needsRedraw = true;
            }
            // Right arrow - next
            else if (x > SCREEN_W - 60) {
                switch (currentView) {
                    case VIEW_DAY:
                        addDays(&viewDate, 1);
                        break;
                    case VIEW_WEEK:
                        addDays(&viewDate, 7);
                        break;
                    case VIEW_MONTH:
                        viewDate.tm_mon++;
                        mktime(&viewDate);
                        break;
                }
                needsRedraw = true;
            }
            // View mode buttons (right side of header)
            else if (x > SCREEN_W - 280) {
                int btnX = x - (SCREEN_W - 280);
                if (btnX < 80) {
                    currentView = VIEW_DAY;
                    needsRedraw = true;
                } else if (btnX < 170) {
                    currentView = VIEW_WEEK;
                    needsRedraw = true;
                } else if (btnX < 260) {
                    currentView = VIEW_MONTH;
                    needsRedraw = true;
                }
            }
        }
        // Month view - tap on day to switch to day view
        else if (currentView == VIEW_MONTH && y > 100 && y < SCREEN_H - 45) {
            int cellW = SCREEN_W / 7;
            int headerH = 30;
            int cellH = (SCREEN_H - 180) / 6;

            int col = x / cellW;
            int row = (y - 100 - headerH) / cellH;

            if (col >= 0 && col < 7 && row >= 0 && row < 6) {
                // Calculate which day was tapped
                struct tm firstDay = viewDate;
                firstDay.tm_mday = 1;
                mktime(&firstDay);
                int startDow = getWeekday(&firstDay);

                int dayNum = row * 7 + col - startDow + 1;

                struct tm nextMonth = firstDay;
                nextMonth.tm_mon++;
                mktime(&nextMonth);
                int daysInMonth = (mktime(&nextMonth) - mktime(&firstDay)) / 86400;

                if (dayNum >= 1 && dayNum <= daysInMonth) {
                    viewDate.tm_mday = dayNum;
                    mktime(&viewDate);
                    currentView = VIEW_DAY;
                    needsRedraw = true;
                }
            }
        }
        // Week view - tap on day column to switch to day view
        else if (currentView == VIEW_WEEK && y > 110) {
            int colW = (SCREEN_W - 60) / 7;
            int col = (x - 60) / colW;

            if (col >= 0 && col < 7) {
                struct tm weekStart;
                getWeekStart(&viewDate, &weekStart);
                addDays(&weekStart, col);
                viewDate = weekStart;
                currentView = VIEW_DAY;
                needsRedraw = true;
            }
        }
    }
}

// ============================================================================
// Setup
// ============================================================================
void setup() {
    Serial.begin(115200);
    Serial.println("\n=== Family Calendar ===");

    // Initialize display
    lcd.init();
    lcd.setRotation(0);
    lcd.setBrightness(200);
    lcd.fillScreen(COLOR_BG);

    lcd.setTextColor(COLOR_TEXT);
    lcd.setTextSize(1);
    lcd.drawCentreString("Family Calendar", SCREEN_W / 2, SCREEN_H / 2 - 60, 4);
    lcd.drawCentreString("Starting up...", SCREEN_W / 2, SCREEN_H / 2, 2);

    delay(1000);

    // Connect to WiFi
    connectWiFi();

    // Initialize time
    initTime();

    // Fetch calendar data
    fetchAllCalendars();

    // Initial draw
    needsRedraw = true;
}

// ============================================================================
// Main Loop
// ============================================================================
void loop() {
    // Handle touch input
    handleTouch();

    // Check for periodic refresh
    if (millis() - lastRefresh > REFRESH_INTERVAL) {
        Serial.println("Auto-refresh triggered");
        fetchAllCalendars();
        needsRedraw = true;
    }

    // Redraw if needed
    if (needsRedraw) {
        draw();
    }

    // Update time indicator every minute (for day view)
    static unsigned long lastMinuteUpdate = 0;
    if (currentView == VIEW_DAY && millis() - lastMinuteUpdate > 60000) {
        lastMinuteUpdate = millis();
        needsRedraw = true;  // Redraw to update time indicator
    }

    delay(50);  // Small delay to prevent tight loop
}
