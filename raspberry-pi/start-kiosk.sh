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
    API_KEY="YOUR_API_KEY_HERE"
    VIEW="WEEK"
    REFRESH_INTERVAL="15"

    KIOSK_URL="http://localhost:3000/display?apiKey=$API_KEY&view=$VIEW&refresh=$REFRESH_INTERVAL"
fi

# Start Chromium in kiosk mode
chromium-browser \
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
    "$KIOSK_URL"
