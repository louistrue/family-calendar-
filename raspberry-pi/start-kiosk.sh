#!/bin/bash
# Family Calendar - Kiosk Mode Startup Script
# This script starts Chromium in kiosk mode displaying the calendar

# Wait for the display server to be ready
sleep 5

# Hide mouse cursor after inactivity
unclutter -idle 0.5 -root &

# Disable screen blanking and power saving
xset s off
xset -dpms
xset s noblank

# Wait for the application server to be ready
echo "Waiting for calendar server to start..."
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s http://localhost:3000 > /dev/null; then
        echo "Server is ready!"
        break
    fi
    echo "Waiting... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
    RETRY_COUNT=$((RETRY_COUNT + 1))
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "ERROR: Server failed to start within timeout period"
    # Show error page in browser anyway
    KIOSK_URL="data:text/html,<h1>Calendar Server Error</h1><p>The calendar server failed to start. Please check the service status.</p>"
else
    # Configure your display URL here
    # Format: http://localhost:3000/display?apiKey=YOUR_KEY&view=WEEK&refresh=15
    API_KEY="To the moon and back"
    VIEW="WEEK"
    REFRESH_INTERVAL="15"

    KIOSK_URL="http://localhost:3000/display?apiKey=$API_KEY&view=$VIEW&refresh=$REFRESH_INTERVAL"
fi

# =============================================================================
# DISPLAY SCALING - Adjust based on your screen and preference
# =============================================================================
# For 7" touchscreen (800x480): use 1.0 or 1.1
# For 7" touchscreen (1024x600): use 1.25 - 1.5
# For 10" touchscreen: use 1.25 - 1.5
# For larger screens: use 1.0 - 1.25
SCALE_FACTOR="1.35"

# Start Chromium in kiosk mode with full touch support
chromium \
    --kiosk \
    --noerrdialogs \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-features=TranslateUI \
    --check-for-update-interval=31536000 \
    --autoplay-policy=no-user-gesture-required \
    --no-first-run \
    --fast \
    --fast-start \
    --disable-features=Translate \
    --disk-cache-dir=/dev/null \
    --password-store=basic \
    --use-gl=egl \
    --touch-events=enabled \
    --enable-touch-drag-drop \
    --enable-pinch \
    --force-device-scale-factor=$SCALE_FACTOR \
    --enable-features=TouchpadOverscrollHistoryNavigation \
    --disable-smooth-scrolling \
    --enable-accelerated-overflow-scroll \
    "$KIOSK_URL"
