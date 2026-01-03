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

// Screen dimensions
#define SCREEN_WIDTH 1024
#define SCREEN_HEIGHT 600
#define HEADER_HEIGHT 50
#define HOUR_HEIGHT_WEEK 48
#define HOUR_HEIGHT_DAY 48  // FIXED: Match Simulator (48px)

// Colors
#define COLOR_BG        0x0842  // Very dark blue/black
#define COLOR_HEADER    0x1084  
#define COLOR_TODAY     0x4208  
#define COLOR_TEXT      0xFFFF  
#define COLOR_TEXT_DIM  0x9CDF  
#define COLOR_GRID      0x2945  
#define COLOR_NOW       0xF800  
#define COLOR_ACCENT    0x634F 
#define COLOR_DIM_TEXT  0x39E7

enum ViewMode { VIEW_DAY, VIEW_WEEK, VIEW_MONTH };

struct CalEvent {
  String title;
  time_t start;
  time_t end;
  uint16_t color;
  String location;
  bool allDay;
};

struct CalInfo {
  String name;
  uint16_t color;
  String id;
};

// Globals
ViewMode currentView = VIEW_WEEK;
struct tm viewDate;
unsigned long lastRefresh = 0;

std::vector<CalEvent> events;
std::vector<CalInfo> calendars;

const char* monthNames[] = {"Januar", "Februar", "Maerz", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"};
const char* dayNamesShort[] = {"So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"};
const char* dayNamesLong[] = {"Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"};

// Touch state
int touchX = -1, touchY = -1;
int touchStartX = -1, touchStartY = -1;
bool touched = false;
unsigned long lastTouch = 0;

// Forward declarations
void draw();
void fetchEvents();

// Helpers
uint16_t hexToRGB(String hex) {
  if (hex.startsWith("#")) hex = hex.substring(1);
  long number = strtol(hex.c_str(), NULL, 16);
  uint8_t r = (number >> 16) & 0xFF;
  uint8_t g = (number >> 8) & 0xFF;
  uint8_t b = number & 0xFF;
  return tft.color565(r, g, b);
}

time_t parseISO(String iso) {
  struct tm t = {0};
  strptime(iso.c_str(), "%Y-%m-%dT%H:%M:%S", &t);
  return mktime(&t); // Assumes local time or needs adjustment if UTC
}

bool connectWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 20) {
    delay(500);
    tries++;
  }
  return WiFi.status() == WL_CONNECTED;
}

void syncTime() {
  configTime(GMT_OFFSET * 3600, DST_OFFSET * 3600, NTP_SERVER);
  struct tm timeinfo;
  if(!getLocalTime(&timeinfo)){
    return;
  }
  viewDate = timeinfo;
}

int getEventsForDay(time_t dayStart, CalEvent** outEvents, int maxEvents) {
  struct tm dayTm;
  localtime_r(&dayStart, &dayTm);
  dayTm.tm_hour = 0; dayTm.tm_min = 0; dayTm.tm_sec = 0;
  time_t dayMin = mktime(&dayTm);
  dayTm.tm_hour = 23; dayTm.tm_min = 59; dayTm.tm_sec = 59;
  time_t dayMax = mktime(&dayTm);

  int count = 0;
  for (auto& e : events) {
    if (e.start < dayMax && e.end > dayMin) {
      if (count < maxEvents) {
        outEvents[count++] = &e;
      }
    }
  }
  return count;
}

bool fetchEvents() {
    if(WiFi.status() != WL_CONNECTED) return false;
    
    HTTPClient http;
    // Construct URL with range
    // Simplify: just fetch -1 month to +2 months from now
    time_t now; time(&now);
    struct tm startTm; localtime_r(&now, &startTm);
    startTm.tm_mon -= 1; mktime(&startTm);
    struct tm endTm; localtime_r(&now, &endTm);
    endTm.tm_mon += 2; mktime(&endTm);
    
    char url[256];
    char startIso[30], endIso[30];
    strftime(startIso, sizeof(startIso), "%Y-%m-%dT%H:%M:%SZ", &startTm);
    strftime(endIso, sizeof(endIso), "%Y-%m-%dT%H:%M:%SZ", &endTm);
    
    snprintf(url, sizeof(url), "%s?from=%s&to=%s", API_URL, startIso, endIso);
    
    http.begin(url);
    http.addHeader("x-api-key", API_SECRET);
    
    int code = http.GET();
    if(code == HTTP_CODE_OK) {
        String payload = http.getString();
        DynamicJsonDocument doc(32768); // ~32KB buffer
        DeserializationError error = deserializeJson(doc, payload);
        
        if(!error) {
            events.clear();
            JsonArray evts = doc["events"];
            for(JsonVariant v : evts) {
                CalEvent e;
                e.title = v["title"].as<String>();
                e.start = parseISO(v["start"].as<String>());
                e.end = parseISO(v["end"].as<String>());
                e.color = hexToRGB(v["color"].as<String>());
                e.location = v["location"] | "";
                e.allDay = v["allDay"];
                events.push_back(e);
            }
            
            calendars.clear();
            JsonArray cals = doc["calendars"];
            for(JsonVariant c : cals) {
               CalInfo ci;
               ci.name = c["name"].as<String>();
               ci.color = hexToRGB(c["color"].as<String>());
               calendars.push_back(ci);
            }
            lastRefresh = millis();
            http.end();
            return true;
        }
    }
    http.end();
    return false;
}

void drawLegend() {
   // Floating legend logic
   int num = calendars.size();
   int totalW = 0;
   // Measure? Approximation
   // Fixed width per item?
   int itemW = 120; 
   int x = (SCREEN_WIDTH - (num * itemW)) / 2;
   int y = SCREEN_HEIGHT - 30; // Bottom
   
   for(auto& c : calendars) {
       tft.fillCircle(x + 10, y + 10, 4, c.color);
       tft.setTextColor(COLOR_TEXT_DIM);
       tft.setTextSize(1);
       tft.setCursor(x + 20, y + 6);
       tft.print(c.name);
       x += itemW;
   }
}


// Draw header with navigation
void drawHeader() {
  tft.fillRect(0, 0, SCREEN_WIDTH, HEADER_HEIGHT, COLOR_HEADER);

  // Left arrow
  tft.fillTriangle(20, 25, 40, 10, 40, 40, COLOR_TEXT);

  // Title
  char title[32];
  snprintf(title, sizeof(title), "%s %d", monthNames[viewDate.tm_mon], viewDate.tm_year + 1900);
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

  const char* labels[] = {"TAG", "WOCHE", "MON"};
  ViewMode modes[] = {VIEW_DAY, VIEW_WEEK, VIEW_MONTH};

  for (int i = 0; i < 3; i++) {
    uint16_t bg = (currentView == modes[i]) ? COLOR_ACCENT : COLOR_HEADER;
    tft.fillRoundRect(btnX, btnY, btnW, btnH, 4, bg);
    tft.drawRoundRect(btnX, btnY, btnW, btnH, 4, COLOR_TEXT);
    tft.setTextSize(2);
    tft.setCursor(btnX + 10, btnY + 10);
    tft.print(labels[i]);
    btnX += btnW + 5;
  }
}

// Draw month view
void drawMonthView() {
  tft.fillScreen(COLOR_BG);
  drawHeader();

  struct tm firstOfMonth = viewDate;
  firstOfMonth.tm_mday = 1;
  mktime(&firstOfMonth);

  // Mon=0, Sun=6 adjustment
  int startDayOfWeek = firstOfMonth.tm_wday - 1;
  if (startDayOfWeek < 0) startDayOfWeek = 6;

  struct tm gridStart = firstOfMonth;
  gridStart.tm_mday -= startDayOfWeek;
  mktime(&gridStart);

  time_t now; time(&now);
  struct tm today; localtime_r(&now, &today);

  // Metrics
  int startY = 80; // Below header + weekdays
  int cellW = SCREEN_WIDTH / 7;
  int cellH = (SCREEN_HEIGHT - startY) / 6;

  const char* weekDaysDe[] = {"Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"};
  tft.setTextColor(COLOR_TEXT_DIM);
  tft.setTextSize(2);
  for (int i = 0; i < 7; i++) {
    tft.setCursor(i * cellW + 10, HEADER_HEIGHT + 5); 
    tft.print(weekDaysDe[i]);
  }
  
  // 42 cells
  for (int i = 0; i < 42; i++) {
    struct tm currentDay = gridStart;
    currentDay.tm_mday += i;
    time_t currentDayTime = mktime(&currentDay);

    int col = i % 7;
    int row = i / 7;
    int x = col * cellW;
    int y = startY + row * cellH;

    bool isCurrentMonth = (currentDay.tm_mon == viewDate.tm_mon);
    bool isToday = (currentDay.tm_mday == today.tm_mday &&
                    currentDay.tm_mon == today.tm_mon &&
                    currentDay.tm_year == today.tm_year);

    if (isToday) {
      tft.fillRect(x, y, cellW, cellH, COLOR_TODAY);
    } 

    tft.drawRect(x, y, cellW, cellH, COLOR_GRID);

    tft.setTextSize(2);
    tft.setCursor(x + 5, y + 5);
    
    if (isToday) tft.setTextColor(0xFFFF); 
    else if (isCurrentMonth) tft.setTextColor(COLOR_TEXT_DIM);
    else tft.setTextColor(COLOR_DIM_TEXT); 

    tft.print(currentDay.tm_mday);

    CalEvent* dayEvents[5];
    int numEvents = getEventsForDay(currentDayTime, dayEvents, 5);

    int evtY = y + 28;
    for (int e = 0; e < numEvents && evtY < y + cellH - 10; e++) {
      uint16_t color = dayEvents[e]->color;
      if (!isCurrentMonth) {
         color = (color >> 1) & 0x7BEF; 
      }
      
      tft.fillRoundRect(x + 3, evtY, cellW - 6, 14, 2, color);
      tft.setTextColor(COLOR_TEXT);
      tft.setTextSize(1);
      tft.setCursor(x + 5, evtY + 3);
      
      String title = dayEvents[e]->title;
      if (title.length() > 12) title = title.substring(0, 11) + "..";
      tft.print(title);
      evtY += 16;
    }
  }

  drawLegend();
}

void drawWeekView() {
  tft.fillScreen(COLOR_BG);
  drawHeader();

  int startHour = 7;
  int endHour = 18; 
  int hourH = HOUR_HEIGHT_WEEK;

  struct tm weekStart = viewDate;
  int currentWday = weekStart.tm_wday; 
  int daysSinceMon = currentWday - 1;
  if (daysSinceMon < 0) daysSinceMon = 6;
  
  weekStart.tm_mday -= daysSinceMon;
  weekStart.tm_hour = 0; weekStart.tm_min = 0; weekStart.tm_sec = 0;
  mktime(&weekStart);

  time_t now; time(&now);
  struct tm today; localtime_r(&now, &today);

  // Headers
  int hourW = 50;
  int cellW = (SCREEN_WIDTH - hourW) / 7;
  int headerY = HEADER_HEIGHT;
  int headerH = 45; 
  const char* weekDaysDe[] = {"So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"};

  for (int d = 0; d < 7; d++) {
    struct tm day = weekStart;
    day.tm_mday += d;
    mktime(&day);

    bool isToday = (day.tm_mday == today.tm_mday &&
                    day.tm_mon == today.tm_mon &&
                    day.tm_year == today.tm_year);

    int x = hourW + d * cellW;
    tft.fillRect(x, headerY, cellW, headerH, isToday ? COLOR_TODAY : COLOR_BG);
    tft.drawRect(x, headerY, cellW, headerH, COLOR_GRID);

    tft.setTextColor(isToday ? 0xFFFF : COLOR_TEXT_DIM);
    tft.setTextSize(1);
    tft.setCursor(x + 10, headerY + 8);
    tft.print(weekDaysDe[day.tm_wday]); 
    tft.setTextSize(2);
    tft.setCursor(x + 10, headerY + 20);
    tft.print(day.tm_mday);
  }

  // Grid
  int gridY = headerY + headerH;
  for (int h = startHour; h <= endHour; h++) {
    int y = gridY + (h - startHour) * hourH;
    tft.setTextColor(COLOR_TEXT_DIM);
    tft.setTextSize(1);
    tft.setCursor(5, y + 2);
    tft.printf("%d:00", h);
    tft.drawLine(0, y, SCREEN_WIDTH, y, COLOR_GRID);
  }
  
  for (int d = 0; d <= 7; d++) {
     tft.drawLine(hourW + d * cellW, gridY, hourW + d * cellW, SCREEN_HEIGHT, COLOR_GRID);
  }

  // Events - smart layout: side-by-side ONLY when overlapping
  for (int d = 0; d < 7; d++) {
    struct tm day = weekStart;
    day.tm_mday += d;
    time_t dayStart = mktime(&day);
    CalEvent* dayEvents[20];
    int numEvents = getEventsForDay(dayStart, dayEvents, 20);

    int dayColX = hourW + d * cellW;
    int colPadding = 2;

    // Pre-calculate start/end hours for all events
    float evtStartH[20], evtEndH[20];
    for (int i = 0; i < numEvents; i++) {
       struct tm st, et;
       localtime_r(&dayEvents[i]->start, &st);
       localtime_r(&dayEvents[i]->end, &et);
       evtStartH[i] = st.tm_hour + st.tm_min / 60.0;
       evtEndH[i] = et.tm_hour + et.tm_min / 60.0;
    }

    for (int i = 0; i < numEvents; i++) {
       float s = evtStartH[i];
       float e = evtEndH[i];
       
       // Clamp to view
       if (s < startHour) s = startHour;
       if (e > endHour) e = endHour;
       if (e <= s) continue;

       // Check for overlaps with OTHER events
       int overlapCount = 0;
       int myColumn = 0;
       for (int j = 0; j < numEvents; j++) {
          if (i == j) continue;
          // Check time overlap
          if (max(evtStartH[i], evtStartH[j]) < min(evtEndH[i], evtEndH[j])) {
             overlapCount++;
             // Determine column order by start time, then by index
             if (evtStartH[j] < evtStartH[i] || 
                 (evtStartH[j] == evtStartH[i] && j < i)) {
                myColumn++;
             }
          }
       }

       int evtX, evtWidth;
       if (overlapCount == 0) {
          // No overlaps - full width
          evtX = dayColX + colPadding;
          evtWidth = cellW - (colPadding * 2);
       } else {
          // Has overlaps - split into columns
          int totalCols = overlapCount + 1;
          int slotWidth = (cellW - (colPadding * 2)) / totalCols;
          evtX = dayColX + colPadding + myColumn * slotWidth;
          evtWidth = slotWidth - colPadding;
          if (evtWidth < 10) evtWidth = 10;
       }

       int top = gridY + (int)((s - startHour) * hourH);
       int height = (int)((e - s) * hourH);
       
       tft.fillRoundRect(evtX, top + 1, evtWidth, height - 2, 4, dayEvents[i]->color);
       
       if (evtWidth > 20 && height > 12) {
           tft.setTextColor(0xFFFF);
           tft.setTextSize(1);
           tft.setCursor(evtX + 3, top + 3);
           int maxChars = evtWidth / 7;
           if (maxChars > 10) maxChars = 10;
           tft.print(dayEvents[i]->title.substring(0, maxChars));
       }
    }
  }
  
  drawLegend(); 
}

void sortEvents(CalEvent** events, int count) {
  for (int i = 1; i < count; i++) {
    CalEvent* key = events[i];
    int j = i - 1;
    while (j >= 0 && events[j]->start > key->start) {
      events[j + 1] = events[j];
      j--;
    }
    events[j + 1] = key;
  }
}

void drawDayView() {
  tft.fillScreen(COLOR_BG);
  drawHeader();

  time_t now; time(&now);
  struct tm today; localtime_r(&now, &today);
  bool isToday = (viewDate.tm_mday == today.tm_mday &&
                  viewDate.tm_mon == today.tm_mon &&
                  viewDate.tm_year == today.tm_year);

  int startHour = 7;
  int endHour = 18; 
  int hourH = HOUR_HEIGHT_DAY;

  int headerY = HEADER_HEIGHT;
  // Sub-header for date
  int gridY = headerY + 40; 

  char dateStr[64];
  snprintf(dateStr, sizeof(dateStr), "%s, %d. %s %d", dayNamesLong[viewDate.tm_wday], viewDate.tm_mday, monthNames[viewDate.tm_mon], viewDate.tm_year + 1900);
  
  tft.setTextColor(isToday ? 0xFFFF : COLOR_TEXT);
  tft.setTextSize(2);
  tft.setCursor(80, headerY + 10);
  tft.print(dateStr);
  
  if (isToday) {
     tft.print(" HEUTE");
  }

  int hourW = 60;
  for (int h = startHour; h <= endHour; h++) {
     int y = gridY + (h - startHour) * hourH;
     tft.setTextColor(COLOR_TEXT_DIM);
     tft.setTextSize(2);
     tft.setCursor(5, y - 6);
     tft.printf("%2d:00", h);
     tft.drawLine(hourW, y, SCREEN_WIDTH, y, COLOR_GRID); 
  }

  struct tm dayTm = viewDate;
  dayTm.tm_hour = 0; dayTm.tm_min = 0; dayTm.tm_sec = 0;
  time_t dayStart = mktime(&dayTm);
  CalEvent* dayEvents[30];
  int numEvents = getEventsForDay(dayStart, dayEvents, 30);
  
  sortEvents(dayEvents, numEvents);
  
  struct LayoutInfo {
     int col;
     float startH;
     float endH;
  };
  LayoutInfo layouts[30];
  
  float colEndTimes[10]; 
  for(int k=0; k<10; k++) colEndTimes[k] = -1.0;
  
  for (int i = 0; i < numEvents; i++) {
     struct tm st, et;
     localtime_r(&dayEvents[i]->start, &st);
     localtime_r(&dayEvents[i]->end, &et);
     float startH = st.tm_hour + st.tm_min / 60.0;
     float endH = et.tm_hour + et.tm_min / 60.0;
     layouts[i].startH = startH;
     layouts[i].endH = endH;
     
     int placedCol = 0;
     for (int c = 0; c < 10; c++) {
        if (startH >= colEndTimes[c]) {
           placedCol = c;
           colEndTimes[c] = endH;
           break;
        }
     }
     layouts[i].col = placedCol;
  }
  
  int totalW = SCREEN_WIDTH - hourW - 20; 
  
  for (int i = 0; i < numEvents; i++) {
     int maxColInGroup = 0;
     for (int j = 0; j < numEvents; j++) {
        if (i == j) continue;
        if (max(layouts[i].startH, layouts[j].startH) < min(layouts[i].endH, layouts[j].endH)) {
            if (layouts[j].col > maxColInGroup) maxColInGroup = layouts[j].col;
        }
     }
     if (layouts[i].col > maxColInGroup) maxColInGroup = layouts[i].col;
     
     int colCount = maxColInGroup + 1;
     int width = totalW / colCount;
     int left = hourW + 10 + layouts[i].col * width;
     
     float s = layouts[i].startH;
     float e = layouts[i].endH;
     if (s < startHour) s = startHour;
     if (e > endHour) e = endHour;
     if (e <= s) continue;
     
     int top = gridY + (int)((s - startHour) * hourH);
     int h = (int)((e - s) * hourH);
     
     tft.fillRoundRect(left, top, width - 4, h - 2, 6, dayEvents[i]->color);
     
     tft.setTextColor(0xFFFF);
     tft.setTextSize(2);
     tft.setCursor(left + 5, top + 5);
     if (width < 80) tft.setTextSize(1);
     
     String title = dayEvents[i]->title;
     int maxChars = width / 12; 
     if (title.length() > maxChars) title = title.substring(0, maxChars) + ".";
     tft.print(title);
     
     tft.setCursor(left + 5, top + 25);
     tft.setTextSize(1);
     struct tm st; localtime_r(&dayEvents[i]->start, &st);
     struct tm et; localtime_r(&dayEvents[i]->end, &et);
     tft.printf("%02d:%02d-%02d:%02d", st.tm_hour, st.tm_min, et.tm_hour, et.tm_min);
  }
  
  drawLegend();
}

void handleTouch() {
  uint16_t x, y;
  bool isTouching = tft.getTouch(&x, &y);

  if (isTouching) {
    if (!touched) {
      touched = true;
      touchStartX = x;
      touchStartY = y;
      lastTouch = millis();
    }
    touchX = x;
    touchY = y;
  } else {
    if (touched) {
      touched = false;
      int dx = touchX - touchStartX;
      int dy = touchY - touchStartY;
      
      if (abs(dx) > 50 && abs(dy) < 60) {
        if (dx > 0) {
          if (currentView == VIEW_MONTH) viewDate.tm_mon--;
          else if (currentView == VIEW_WEEK) viewDate.tm_mday -= 7;
          else viewDate.tm_mday--;
        } else {
          if (currentView == VIEW_MONTH) viewDate.tm_mon++;
          else if (currentView == VIEW_WEEK) viewDate.tm_mday += 7;
          else viewDate.tm_mday++;
        }
        mktime(&viewDate);
        draw(); 
        return;
      }

      if (millis() - lastTouch < 500 && abs(dx) < 10 && abs(dy) < 10) {
         if (touchStartY < 50) {
            if (touchStartX < 80) { 
               if (currentView == VIEW_MONTH) viewDate.tm_mon--;
               else if (currentView == VIEW_WEEK) viewDate.tm_mday -= 7;
               else viewDate.tm_mday--;
               mktime(&viewDate);
               draw();
               return;
            }
            if (touchStartX > SCREEN_WIDTH - 80) { 
               if (currentView == VIEW_MONTH) viewDate.tm_mon++;
               else if (currentView == VIEW_WEEK) viewDate.tm_mday += 7;
               else viewDate.tm_mday++;
               mktime(&viewDate);
               draw();
               return;
            }
            int btnX = SCREEN_WIDTH - 250;
            if (touchStartX >= btnX && touchStartX < btnX + 70) currentView = VIEW_DAY;
            else if (touchStartX >= btnX + 75 && touchStartX < btnX + 145) currentView = VIEW_WEEK;
            else if (touchStartX >= btnX + 150 && touchStartX < btnX + 220) currentView = VIEW_MONTH;
            draw();
         }
      }
    }
  }
}

void draw() {
  switch (currentView) {
    case VIEW_DAY:   drawDayView(); break;
    case VIEW_WEEK:  drawWeekView(); break;
    case VIEW_MONTH: drawMonthView(); break;
  }
}

void setup() {
  Serial.begin(115200);

  tft.init();
  tft.setRotation(0);
  tft.fillScreen(COLOR_BG);
  tft.setTextColor(COLOR_TEXT);

  if (!connectWiFi()) {
    tft.println("WiFi failed. Restarting...");
    delay(3000);
    ESP.restart();
  }

  syncTime();

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

  draw();
}

void loop() {
  handleTouch();

  if (millis() - lastRefresh > REFRESH_INTERVAL) {
    fetchEvents();
    draw();
  }

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

  static unsigned long lastTimeUpdate = 0;
  if (millis() - lastTimeUpdate > 60000) {
    lastTimeUpdate = millis();
    if (currentView != VIEW_MONTH) {
      draw();
    }
  }
  delay(50);
}
