/*
 * Family Calendar Display
 * For Makerfabs MaTouch ESP32-S3 7" (1024x600)
 *
 * Features:
 * - 4 calendars, color-coded
 * - Day/Week/Month views with touch navigation
 * - Auto-refresh every 5 minutes
 * - Current time indicator
 */

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>
#include "lgfx_config.h"
#include "secrets.h"

// Display
static LGFX tft;
static LGFX_Sprite canvas(&tft);

// Screen dimensions
#define SCREEN_WIDTH 1024
#define SCREEN_HEIGHT 600

// Colors
#define COLOR_BG        0x1084  // Dark gray
#define COLOR_HEADER    0x2104  // Slightly lighter
#define COLOR_TODAY     0x4208  // Highlight for today
#define COLOR_TEXT      0xFFFF  // White
#define COLOR_TEXT_DIM  0x8410  // Gray text
#define COLOR_GRID      0x3186  // Grid lines
#define COLOR_NOW       0xF800  // Red for current time indicator

// View modes
enum ViewMode { VIEW_DAY, VIEW_WEEK, VIEW_MONTH };
ViewMode currentView = VIEW_WEEK;

// Calendar event structure
struct CalEvent {
  String id;
  String title;
  time_t start;
  time_t end;
  bool allDay;
  String calendar;
  uint16_t color;
};

// Event storage
#define MAX_EVENTS 200
CalEvent events[MAX_EVENTS];
int eventCount = 0;

// Calendar info
struct CalInfo {
  String name;
  uint16_t color;
};
CalInfo calendars[4];
int calendarCount = 0;

// Current date navigation
struct tm viewDate;

// Touch state
int touchX = -1, touchY = -1;
bool touched = false;
unsigned long lastTouch = 0;

// Refresh timer
unsigned long lastRefresh = 0;

// Convert hex color string to RGB565
uint16_t hexToRGB565(const String& hex) {
  String h = hex;
  if (h.startsWith("#")) h = h.substring(1);

  long rgb = strtol(h.c_str(), NULL, 16);
  uint8_t r = (rgb >> 16) & 0xFF;
  uint8_t g = (rgb >> 8) & 0xFF;
  uint8_t b = rgb & 0xFF;

  return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3);
}

// Parse ISO8601 datetime to time_t
time_t parseISO8601(const String& iso) {
  struct tm t = {0};
  sscanf(iso.c_str(), "%d-%d-%dT%d:%d:%d",
         &t.tm_year, &t.tm_mon, &t.tm_mday,
         &t.tm_hour, &t.tm_min, &t.tm_sec);
  t.tm_year -= 1900;
  t.tm_mon -= 1;
  return mktime(&t);
}

// Get start of day
time_t startOfDay(struct tm* t) {
  struct tm day = *t;
  day.tm_hour = 0;
  day.tm_min = 0;
  day.tm_sec = 0;
  return mktime(&day);
}

// Get current time
void updateTime() {
  time_t now;
  time(&now);
  localtime_r(&now, &viewDate);
}

// Connect to WiFi
bool connectWiFi() {
  tft.setTextSize(2);
  tft.setTextColor(COLOR_TEXT);
  tft.setCursor(20, SCREEN_HEIGHT / 2);
  tft.print("Connecting to WiFi...");

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    tft.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    tft.println(" Connected!");
    delay(500);
    return true;
  }

  tft.println(" Failed!");
  return false;
}

// Sync time from NTP
void syncTime() {
  configTime(GMT_OFFSET * 3600, DST_OFFSET * 3600, NTP_SERVER);

  tft.setCursor(20, SCREEN_HEIGHT / 2 + 40);
  tft.print("Syncing time...");

  struct tm timeinfo;
  if (getLocalTime(&timeinfo, 10000)) {
    tft.println(" OK");
    viewDate = timeinfo;
  } else {
    tft.println(" Failed");
  }
  delay(500);
}

// Fetch events from API
bool fetchEvents() {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;

  // Calculate date range (1 month before to 2 months after)
  struct tm from = viewDate;
  from.tm_mon -= 1;
  from.tm_mday = 1;
  mktime(&from);

  struct tm to = viewDate;
  to.tm_mon += 2;
  to.tm_mday = 1;
  mktime(&to);

  char url[256];
  snprintf(url, sizeof(url), "%s?from=%04d-%02d-%02d&to=%04d-%02d-%02d",
           API_URL,
           from.tm_year + 1900, from.tm_mon + 1, from.tm_mday,
           to.tm_year + 1900, to.tm_mon + 1, to.tm_mday);

  http.begin(url);
  http.addHeader("x-api-key", API_SECRET);
  http.setTimeout(15000);

  int httpCode = http.GET();
  if (httpCode != HTTP_CODE_OK) {
    http.end();
    return false;
  }

  String payload = http.getString();
  http.end();

  // Parse JSON
  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, payload);
  if (error) return false;

  // Parse calendars
  calendarCount = 0;
  JsonArray cals = doc["calendars"];
  for (JsonObject cal : cals) {
    if (calendarCount < 4) {
      calendars[calendarCount].name = cal["name"].as<String>();
      calendars[calendarCount].color = hexToRGB565(cal["color"].as<String>());
      calendarCount++;
    }
  }

  // Parse events
  eventCount = 0;
  JsonArray evts = doc["events"];
  for (JsonObject evt : evts) {
    if (eventCount >= MAX_EVENTS) break;

    events[eventCount].id = evt["id"].as<String>();
    events[eventCount].title = evt["title"].as<String>();
    events[eventCount].start = parseISO8601(evt["start"].as<String>());
    events[eventCount].end = parseISO8601(evt["end"].as<String>());
    events[eventCount].allDay = evt["allDay"].as<bool>();
    events[eventCount].calendar = evt["calendar"].as<String>();
    events[eventCount].color = hexToRGB565(evt["color"].as<String>());
    eventCount++;
  }

  lastRefresh = millis();
  return true;
}

// Draw header with navigation
void drawHeader() {
  // Background
  tft.fillRect(0, 0, SCREEN_WIDTH, 50, COLOR_HEADER);

  // Left arrow
  tft.fillTriangle(20, 25, 40, 10, 40, 40, COLOR_TEXT);

  // Month/Year title
  char title[32];
  strftime(title, sizeof(title), "%B %Y", &viewDate);
  tft.setTextColor(COLOR_TEXT);
  tft.setTextSize(3);
  tft.setCursor(80, 12);
  tft.print(title);

  // Right arrow
  tft.fillTriangle(SCREEN_WIDTH - 20, 25, SCREEN_WIDTH - 40, 10, SCREEN_WIDTH - 40, 40, COLOR_TEXT);

  // View mode buttons
  int btnY = 8;
  int btnH = 34;
  int btnW = 70;
  int btnX = SCREEN_WIDTH - 250;

  const char* labels[] = {"DAY", "WEEK", "MON"};
  ViewMode modes[] = {VIEW_DAY, VIEW_WEEK, VIEW_MONTH};

  for (int i = 0; i < 3; i++) {
    uint16_t bg = (currentView == modes[i]) ? 0x4A69 : COLOR_HEADER;
    tft.fillRoundRect(btnX, btnY, btnW, btnH, 4, bg);
    tft.drawRoundRect(btnX, btnY, btnW, btnH, 4, COLOR_TEXT);
    tft.setTextSize(2);
    tft.setCursor(btnX + 10, btnY + 10);
    tft.print(labels[i]);
    btnX += btnW + 5;
  }
}

// Draw calendar legend
void drawLegend() {
  int y = SCREEN_HEIGHT - 30;
  int x = 20;

  for (int i = 0; i < calendarCount; i++) {
    tft.fillCircle(x, y, 8, calendars[i].color);
    tft.setTextColor(COLOR_TEXT);
    tft.setTextSize(1);
    tft.setCursor(x + 15, y - 4);
    tft.print(calendars[i].name);
    x += 150;
  }
}

// Get events for a specific day
int getEventsForDay(time_t dayStart, CalEvent** dayEvents, int maxEvents) {
  time_t dayEnd = dayStart + 86400;
  int count = 0;

  for (int i = 0; i < eventCount && count < maxEvents; i++) {
    if (events[i].start < dayEnd && events[i].end > dayStart) {
      dayEvents[count++] = &events[i];
    }
  }
  return count;
}

// Draw month view
void drawMonthView() {
  tft.fillScreen(COLOR_BG);
  drawHeader();

  // Calculate first day of month
  struct tm firstDay = viewDate;
  firstDay.tm_mday = 1;
  mktime(&firstDay);

  // Get current day for highlighting
  time_t now;
  time(&now);
  struct tm today;
  localtime_r(&now, &today);

  int startY = 55;
  int cellW = SCREEN_WIDTH / 7;
  int cellH = (SCREEN_HEIGHT - startY - 35) / 6;

  // Day headers
  const char* days[] = {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"};
  tft.setTextColor(COLOR_TEXT_DIM);
  tft.setTextSize(2);
  for (int i = 0; i < 7; i++) {
    tft.setCursor(i * cellW + cellW / 2 - 18, startY);
    tft.print(days[i]);
  }
  startY += 25;

  // Calculate days in month and starting weekday
  int daysInMonth = 31;
  struct tm test = firstDay;
  test.tm_mday = 32;
  mktime(&test);
  daysInMonth = 32 - test.tm_mday;

  int startWeekday = firstDay.tm_wday;

  // Draw calendar grid
  int day = 1;
  for (int row = 0; row < 6 && day <= daysInMonth; row++) {
    for (int col = 0; col < 7; col++) {
      int x = col * cellW;
      int y = startY + row * cellH;

      if ((row == 0 && col < startWeekday) || day > daysInMonth) {
        // Empty cell
        tft.drawRect(x, y, cellW, cellH, COLOR_GRID);
        continue;
      }

      // Check if this is today
      bool isToday = (day == today.tm_mday &&
                      viewDate.tm_mon == today.tm_mon &&
                      viewDate.tm_year == today.tm_year);

      uint16_t bg = isToday ? COLOR_TODAY : COLOR_BG;
      tft.fillRect(x, y, cellW, cellH, bg);
      tft.drawRect(x, y, cellW, cellH, COLOR_GRID);

      // Day number
      tft.setTextColor(isToday ? 0xFFE0 : COLOR_TEXT);
      tft.setTextSize(2);
      tft.setCursor(x + 5, y + 5);
      tft.print(day);

      // Events for this day
      struct tm dayTm = firstDay;
      dayTm.tm_mday = day;
      time_t dayStart = mktime(&dayTm);

      CalEvent* dayEvents[5];
      int numEvents = getEventsForDay(dayStart, dayEvents, 5);

      int evtY = y + 28;
      for (int e = 0; e < numEvents && evtY < y + cellH - 10; e++) {
        tft.fillRoundRect(x + 3, evtY, cellW - 6, 14, 2, dayEvents[e]->color);
        tft.setTextColor(COLOR_TEXT);
        tft.setTextSize(1);
        tft.setCursor(x + 5, evtY + 3);

        String title = dayEvents[e]->title;
        if (title.length() > 12) title = title.substring(0, 11) + "..";
        tft.print(title);
        evtY += 16;
      }

      day++;
    }
  }

  drawLegend();
}

// Draw week view
void drawWeekView() {
  tft.fillScreen(COLOR_BG);
  drawHeader();

  // Find start of week (Sunday)
  struct tm weekStart = viewDate;
  weekStart.tm_mday -= weekStart.tm_wday;
  weekStart.tm_hour = 0;
  weekStart.tm_min = 0;
  weekStart.tm_sec = 0;
  mktime(&weekStart);

  // Current time for indicator
  time_t now;
  time(&now);
  struct tm today;
  localtime_r(&now, &today);

  int headerH = 80;
  int hourW = 50;
  int cellW = (SCREEN_WIDTH - hourW) / 7;
  int hourH = 40;
  int startHour = 7;
  int endHour = 21;

  // Day headers
  const char* days[] = {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"};
  for (int d = 0; d < 7; d++) {
    struct tm day = weekStart;
    day.tm_mday += d;
    mktime(&day);

    bool isToday = (day.tm_mday == today.tm_mday &&
                    day.tm_mon == today.tm_mon &&
                    day.tm_year == today.tm_year);

    int x = hourW + d * cellW;
    uint16_t bg = isToday ? COLOR_TODAY : COLOR_HEADER;
    tft.fillRect(x, 50, cellW, 30, bg);
    tft.drawRect(x, 50, cellW, 30, COLOR_GRID);

    tft.setTextColor(COLOR_TEXT);
    tft.setTextSize(2);
    tft.setCursor(x + 10, 55);
    tft.printf("%s %d", days[d], day.tm_mday);
  }

  // Hour labels and grid
  int gridY = headerH;
  for (int h = startHour; h <= endHour; h++) {
    int y = gridY + (h - startHour) * hourH;

    // Hour label
    tft.setTextColor(COLOR_TEXT_DIM);
    tft.setTextSize(1);
    tft.setCursor(5, y + 2);
    tft.printf("%2d:00", h);

    // Grid lines
    tft.drawLine(hourW, y, SCREEN_WIDTH, y, COLOR_GRID);

    for (int d = 0; d < 7; d++) {
      tft.drawLine(hourW + d * cellW, gridY, hourW + d * cellW, SCREEN_HEIGHT - 35, COLOR_GRID);
    }
  }

  // Current time indicator
  if (today.tm_hour >= startHour && today.tm_hour <= endHour) {
    int todayCol = today.tm_wday;
    struct tm ws = weekStart;
    bool inThisWeek = (today.tm_mday >= ws.tm_mday &&
                       today.tm_mday < ws.tm_mday + 7 &&
                       today.tm_mon == ws.tm_mon);

    if (inThisWeek) {
      float hourPos = today.tm_hour + today.tm_min / 60.0 - startHour;
      int y = gridY + (int)(hourPos * hourH);
      int x = hourW + todayCol * cellW;
      tft.drawLine(x, y, x + cellW, y, COLOR_NOW);
      tft.fillCircle(x, y, 4, COLOR_NOW);
    }
  }

  // Draw events
  for (int d = 0; d < 7; d++) {
    struct tm day = weekStart;
    day.tm_mday += d;
    time_t dayStart = mktime(&day);

    CalEvent* dayEvents[20];
    int numEvents = getEventsForDay(dayStart, dayEvents, 20);

    int x = hourW + d * cellW;

    for (int e = 0; e < numEvents; e++) {
      CalEvent* evt = dayEvents[e];

      struct tm evtStart;
      localtime_r(&evt->start, &evtStart);

      if (evtStart.tm_hour < startHour) evtStart.tm_hour = startHour;

      float startPos = evtStart.tm_hour + evtStart.tm_min / 60.0 - startHour;
      float duration = (evt->end - evt->start) / 3600.0;
      if (startPos + duration > endHour - startHour) {
        duration = endHour - startHour - startPos;
      }

      int y = gridY + (int)(startPos * hourH);
      int h = (int)(duration * hourH);
      if (h < 20) h = 20;

      tft.fillRoundRect(x + 2, y + 1, cellW - 4, h - 2, 3, evt->color);
      tft.setTextColor(COLOR_TEXT);
      tft.setTextSize(1);
      tft.setCursor(x + 5, y + 4);

      String title = evt->title;
      if (title.length() > 15) title = title.substring(0, 14) + "..";
      tft.print(title);
    }
  }

  drawLegend();
}

// Draw day view
void drawDayView() {
  tft.fillScreen(COLOR_BG);
  drawHeader();

  time_t now;
  time(&now);
  struct tm today;
  localtime_r(&now, &today);

  bool isToday = (viewDate.tm_mday == today.tm_mday &&
                  viewDate.tm_mon == today.tm_mon &&
                  viewDate.tm_year == today.tm_year);

  int hourW = 60;
  int hourH = 50;
  int startHour = 6;
  int endHour = 22;
  int gridY = 55;

  // Date subtitle
  char dateStr[32];
  strftime(dateStr, sizeof(dateStr), "%A, %B %d", &viewDate);
  tft.setTextColor(isToday ? 0xFFE0 : COLOR_TEXT);
  tft.setTextSize(2);
  tft.setCursor(80, 55);
  tft.print(dateStr);
  if (isToday) tft.print(" (Today)");

  gridY = 85;

  // Hour grid
  for (int h = startHour; h <= endHour; h++) {
    int y = gridY + (h - startHour) * hourH;

    // Hour label
    tft.setTextColor(COLOR_TEXT_DIM);
    tft.setTextSize(2);
    tft.setCursor(5, y + 2);
    tft.printf("%2d:00", h);

    // Grid line
    tft.drawLine(hourW, y, SCREEN_WIDTH - 20, y, COLOR_GRID);
  }

  // Current time indicator
  if (isToday && today.tm_hour >= startHour && today.tm_hour <= endHour) {
    float hourPos = today.tm_hour + today.tm_min / 60.0 - startHour;
    int y = gridY + (int)(hourPos * hourH);
    tft.drawLine(hourW, y, SCREEN_WIDTH - 20, y, COLOR_NOW);
    tft.fillCircle(hourW, y, 5, COLOR_NOW);

    char timeStr[8];
    sprintf(timeStr, "%02d:%02d", today.tm_hour, today.tm_min);
    tft.setTextColor(COLOR_NOW);
    tft.setTextSize(1);
    tft.setCursor(hourW + 10, y - 10);
    tft.print(timeStr);
  }

  // Get events for this day
  struct tm dayTm = viewDate;
  dayTm.tm_hour = 0;
  dayTm.tm_min = 0;
  dayTm.tm_sec = 0;
  time_t dayStart = mktime(&dayTm);

  CalEvent* dayEvents[30];
  int numEvents = getEventsForDay(dayStart, dayEvents, 30);

  // Draw events
  int eventW = SCREEN_WIDTH - hourW - 40;
  for (int e = 0; e < numEvents; e++) {
    CalEvent* evt = dayEvents[e];

    struct tm evtStart;
    localtime_r(&evt->start, &evtStart);

    if (evtStart.tm_hour < startHour) evtStart.tm_hour = startHour;

    float startPos = evtStart.tm_hour + evtStart.tm_min / 60.0 - startHour;
    float duration = (evt->end - evt->start) / 3600.0;
    if (startPos + duration > endHour - startHour) {
      duration = endHour - startHour - startPos;
    }

    int y = gridY + (int)(startPos * hourH);
    int h = (int)(duration * hourH);
    if (h < 30) h = 30;

    tft.fillRoundRect(hourW + 10, y + 2, eventW, h - 4, 5, evt->color);
    tft.setTextColor(COLOR_TEXT);
    tft.setTextSize(2);
    tft.setCursor(hourW + 20, y + 8);
    tft.print(evt->title);

    // Time
    char timeStr[16];
    struct tm es, ee;
    localtime_r(&evt->start, &es);
    localtime_r(&evt->end, &ee);
    sprintf(timeStr, "%d:%02d - %d:%02d", es.tm_hour, es.tm_min, ee.tm_hour, ee.tm_min);
    tft.setTextSize(1);
    tft.setCursor(hourW + 20, y + 30);
    tft.print(timeStr);
  }

  drawLegend();
}

// Handle touch input
void handleTouch() {
  uint16_t x, y;
  if (tft.getTouch(&x, &y)) {
    if (!touched && millis() - lastTouch > 200) {
      touched = true;
      lastTouch = millis();
      touchX = x;
      touchY = y;

      // Check header buttons
      if (y < 50) {
        // Left arrow
        if (x < 60) {
          if (currentView == VIEW_MONTH) {
            viewDate.tm_mon--;
          } else if (currentView == VIEW_WEEK) {
            viewDate.tm_mday -= 7;
          } else {
            viewDate.tm_mday--;
          }
          mktime(&viewDate);
          return;
        }

        // Right arrow
        if (x > SCREEN_WIDTH - 60) {
          if (currentView == VIEW_MONTH) {
            viewDate.tm_mon++;
          } else if (currentView == VIEW_WEEK) {
            viewDate.tm_mday += 7;
          } else {
            viewDate.tm_mday++;
          }
          mktime(&viewDate);
          return;
        }

        // View mode buttons
        int btnX = SCREEN_WIDTH - 250;
        int btnW = 70;
        if (x >= btnX && x < btnX + btnW) {
          currentView = VIEW_DAY;
        } else if (x >= btnX + btnW + 5 && x < btnX + 2 * btnW + 5) {
          currentView = VIEW_WEEK;
        } else if (x >= btnX + 2 * (btnW + 5) && x < btnX + 3 * btnW + 10) {
          currentView = VIEW_MONTH;
        }
      }
    }
  } else {
    touched = false;
  }
}

// Draw current view
void draw() {
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
}

void setup() {
  Serial.begin(115200);

  // Initialize display
  tft.init();
  tft.setRotation(0);
  tft.fillScreen(COLOR_BG);
  tft.setTextColor(COLOR_TEXT);

  // Enable backlight if needed
  // pinMode(BACKLIGHT_PIN, OUTPUT);
  // digitalWrite(BACKLIGHT_PIN, HIGH);

  // Connect WiFi
  if (!connectWiFi()) {
    tft.println("WiFi failed. Restarting...");
    delay(3000);
    ESP.restart();
  }

  // Sync time
  syncTime();

  // Initial fetch
  tft.fillScreen(COLOR_BG);
  tft.setCursor(20, SCREEN_HEIGHT / 2);
  tft.setTextSize(2);
  tft.print("Loading calendars...");

  if (fetchEvents()) {
    tft.println(" OK");
  } else {
    tft.println(" Failed");
  }
  delay(500);

  // Initial draw
  draw();
}

void loop() {
  // Handle touch
  handleTouch();

  // Periodic refresh
  if (millis() - lastRefresh > REFRESH_INTERVAL) {
    fetchEvents();
    draw();
  }

  // Redraw on view change or navigation
  static ViewMode lastView = currentView;
  static struct tm lastDate = viewDate;

  if (currentView != lastView ||
      viewDate.tm_mday != lastDate.tm_mday ||
      viewDate.tm_mon != lastDate.tm_mon ||
      viewDate.tm_year != lastDate.tm_year) {
    draw();
    lastView = currentView;
    lastDate = viewDate;
  }

  // Update time indicator every minute
  static unsigned long lastTimeUpdate = 0;
  if (millis() - lastTimeUpdate > 60000) {
    lastTimeUpdate = millis();
    if (currentView != VIEW_MONTH) {
      draw();
    }
  }

  delay(50);
}
