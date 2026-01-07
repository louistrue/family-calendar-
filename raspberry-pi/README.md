# Family Calendar - Raspberry Pi Setup Guide

This guide will help you set up the Family Calendar on a Raspberry Pi with a touchscreen display and VNC access for remote control from a tablet.

## 🎯 What This Setup Provides

- **Kiosk Mode Display**: Full-screen calendar display on touchscreen
- **Auto-Start**: Calendar starts automatically on boot
- **VNC Access**: Remote control from tablet or other devices
- **Touch Support**: Swipe to navigate, tap to view event details
- **Auto-Refresh**: Calendar data updates automatically
- **Production Ready**: Systemd service with auto-restart

## 📋 Prerequisites

### Hardware Requirements
- Raspberry Pi 4 (recommended) or Raspberry Pi 3
- Official Raspberry Pi Touchscreen (1024x600) or compatible display
- MicroSD card (16GB or larger, Class 10 recommended)
- Power supply (official Raspberry Pi power supply recommended)
- Internet connection (WiFi or Ethernet)

### Software Requirements
- Raspberry Pi OS (Bullseye or newer) with desktop environment
- Git (for cloning the repository)

## 🚀 Quick Start Installation

### 1. Prepare Your Raspberry Pi

Flash Raspberry Pi OS (with desktop) to your SD card using [Raspberry Pi Imager](https://www.raspberrypi.com/software/).

Boot up your Pi and complete the initial setup wizard:
- Set your country, language, and timezone
- Connect to WiFi
- Update software when prompted

### 2. Clone the Repository

```bash
cd ~
git clone https://github.com/yourusername/family-calendar.git
cd family-calendar
```

### 3. Run the Installation Script

```bash
cd raspberry-pi
chmod +x install.sh
./install.sh
```

The installation script will:
- Install Node.js and dependencies
- Install Chromium browser and required packages
- Build the Next.js application
- Set up systemd service for auto-start
- Configure kiosk mode
- Enable VNC server
- Disable screen blanking

### 4. Configure Your Calendar

Edit the environment file with your calendar URLs and API secret:

```bash
nano ~/family-calendar/api/.env
```

Add your calendar ICS URLs and set an API secret:

```env
# Calendar 1 - Work
CAL_1_URL=https://calendar.google.com/calendar/ical/your_calendar_id/basic.ics
CAL_1_NAME=Work
CAL_1_COLOR=#3B82F6

# Calendar 2 - Personal
CAL_2_URL=https://calendar.google.com/calendar/ical/your_calendar_id/basic.ics
CAL_2_NAME=Personal
CAL_2_COLOR=#22C55E

# Add more calendars as needed (CAL_3, CAL_4, etc.)

# API Configuration
API_SECRET="your_secret_api_key_here"
```

**Important**: The `API_SECRET` will be used to access the calendar. Keep it secure!

### 5. Configure Kiosk Display URL

Edit the kiosk startup script to use your API key:

```bash
nano ~/family-calendar/raspberry-pi/start-kiosk.sh
```

Update the following lines:

```bash
API_KEY="your_secret_api_key_here"  # Must match API_SECRET in .env
VIEW="WEEK"                          # Options: DAY, WEEK, MONTH
REFRESH_INTERVAL="15"                # Refresh interval in minutes
```

Or edit the desktop file directly:

```bash
nano ~/.config/autostart/family-calendar.desktop
```

### 6. Start the Service

```bash
sudo systemctl start family-calendar
sudo systemctl status family-calendar
```

Check the logs to ensure it started correctly:

```bash
sudo journalctl -u family-calendar -f
```

### 7. Reboot to Start Kiosk Mode

```bash
sudo reboot
```

After reboot, the calendar should automatically display in full-screen kiosk mode!

## 🔧 Configuration Options

### Display URL Parameters

The display page supports several URL parameters:

```
http://localhost:3000/display?apiKey=YOUR_KEY&view=WEEK&refresh=15
```

| Parameter | Options | Default | Description |
|-----------|---------|---------|-------------|
| `apiKey` | string | required | Your API secret (must match .env) |
| `view` | DAY, WEEK, MONTH | WEEK | Initial view mode |
| `refresh` | number (minutes) | 15 | Auto-refresh interval |

### Touch Gestures

- **Swipe Left**: Navigate to next period
- **Swipe Right**: Navigate to previous period
- **Tap Event**: View event details
- **Tap "Heute"**: Jump to today
- **Tap View Buttons**: Switch between Day/Week/Month views

### Changing the Default View

Edit `~/family-calendar/raspberry-pi/start-kiosk.sh`:

```bash
VIEW="DAY"    # For single day view
VIEW="WEEK"   # For week view (default)
VIEW="MONTH"  # For month view
```

### Adjusting Auto-Refresh

Edit `~/family-calendar/raspberry-pi/start-kiosk.sh`:

```bash
REFRESH_INTERVAL="30"  # Refresh every 30 minutes
REFRESH_INTERVAL="5"   # Refresh every 5 minutes
```

## 📱 VNC Setup for Remote Access

### Enable VNC (Already Done by Install Script)

VNC is automatically enabled during installation. To manually enable:

```bash
sudo raspi-config
# Navigate to: Interface Options > VNC > Enable
```

### Set VNC Password

```bash
sudo vncpasswd
```

### Connect from Tablet/PC

1. Download VNC Viewer on your tablet:
   - iOS: [VNC Viewer on App Store](https://apps.apple.com/app/vnc-viewer/id352019548)
   - Android: [VNC Viewer on Play Store](https://play.google.com/store/apps/details?id=com.realvnc.viewer.android)
   - Windows/Mac: [VNC Viewer Download](https://www.realvnc.com/download/viewer/)

2. Get your Raspberry Pi's IP address:
   ```bash
   hostname -I
   ```

3. In VNC Viewer, connect to: `<raspberry-pi-ip>:5900`
   - Example: `192.168.1.100:5900`

4. Enter the VNC password you set earlier

### VNC Performance Tips

For better performance over VNC:

```bash
sudo raspi-config
# Display Options > VNC Resolution > 1024x600
```

## 🛠️ Service Management

### Start/Stop the Service

```bash
# Start the service
sudo systemctl start family-calendar

# Stop the service
sudo systemctl stop family-calendar

# Restart the service
sudo systemctl restart family-calendar

# Check status
sudo systemctl status family-calendar
```

### View Logs

```bash
# Follow logs in real-time
sudo journalctl -u family-calendar -f

# View last 100 lines
sudo journalctl -u family-calendar -n 100

# View logs from today
sudo journalctl -u family-calendar --since today
```

### Disable Auto-Start

```bash
# Disable service auto-start
sudo systemctl disable family-calendar

# Remove kiosk auto-start
rm ~/.config/autostart/family-calendar.desktop
```

## 🔄 Updating the Application

To update to the latest version:

```bash
cd ~/family-calendar
git pull
cd api
npm install
npm run build
sudo systemctl restart family-calendar
```

## 🐛 Troubleshooting

### Calendar Not Loading

1. Check the service is running:
   ```bash
   sudo systemctl status family-calendar
   ```

2. Check the logs for errors:
   ```bash
   sudo journalctl -u family-calendar -n 50
   ```

3. Verify your .env file has correct calendar URLs:
   ```bash
   cat ~/family-calendar/api/.env
   ```

4. Test the API manually:
   ```bash
   curl -H "x-api-key: YOUR_API_KEY" http://localhost:3000/api/calendar
   ```

### Blank Screen on Boot

1. Check if Chromium is running:
   ```bash
   ps aux | grep chromium
   ```

2. Check the kiosk script logs:
   ```bash
   cat ~/.xsession-errors
   ```

3. Manually test the kiosk script:
   ```bash
   ~/family-calendar/raspberry-pi/start-kiosk.sh
   ```

### Screen Keeps Blanking

Re-run the screen blanking disable commands:

```bash
xset s off
xset -dpms
xset s noblank
```

Add to autostart:

```bash
mkdir -p ~/.config/lxsession/LXDE-pi
cat > ~/.config/lxsession/LXDE-pi/autostart <<EOF
@xset s off
@xset -dpms
@xset s noblank
EOF
```

### VNC Connection Issues

1. Check VNC is enabled:
   ```bash
   sudo systemctl status vncserver-x11-serviced
   ```

2. Restart VNC service:
   ```bash
   sudo systemctl restart vncserver-x11-serviced
   ```

3. Check firewall (if applicable):
   ```bash
   sudo ufw allow 5900
   ```

### Performance Issues

1. Reduce calendar refresh interval in `start-kiosk.sh`
2. Use WEEK or DAY view instead of MONTH
3. Disable VNC when not needed:
   ```bash
   sudo systemctl stop vncserver-x11-serviced
   ```

## 💡 Advanced Configuration

### Custom Screen Resolution

If using a different display:

```bash
# Edit config.txt
sudo nano /boot/config.txt

# Add or modify:
hdmi_group=2
hdmi_mode=87
hdmi_cvt=1024 600 60 6 0 0 0
```

### Auto-Rotate Display

For portrait mode:

```bash
sudo nano /boot/config.txt

# Add:
display_rotate=1  # 90 degrees
display_rotate=2  # 180 degrees
display_rotate=3  # 270 degrees
```

### Reduce Memory Usage

Edit the service file:

```bash
sudo nano /etc/systemd/system/family-calendar.service

# Add under [Service]:
Environment="NODE_OPTIONS=--max-old-space-size=512"
```

### Using a Different Port

```bash
sudo nano /etc/systemd/system/family-calendar.service

# Change:
Environment="PORT=8080"

# Don't forget to update start-kiosk.sh too!
```

## 🔒 Security Best Practices

1. **Change Default Password**: Always change the default Pi password
   ```bash
   passwd
   ```

2. **Use Strong API Key**: Generate a secure random API key
   ```bash
   openssl rand -hex 32
   ```

3. **Firewall**: Consider enabling UFW firewall
   ```bash
   sudo apt-get install ufw
   sudo ufw allow ssh
   sudo ufw allow 5900  # VNC
   sudo ufw enable
   ```

4. **Update Regularly**:
   ```bash
   sudo apt-get update && sudo apt-get upgrade
   ```

5. **Network Security**: Use VPN or restrict VNC to local network only

## 📚 Additional Resources

- [Raspberry Pi Documentation](https://www.raspberrypi.com/documentation/)
- [VNC Server Documentation](https://help.realvnc.com/hc/en-us/articles/360002249917)
- [Next.js Deployment](https://nextjs.org/docs/deployment)

## 🤝 Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review the logs: `sudo journalctl -u family-calendar -n 100`
3. Open an issue on GitHub with logs and error messages

## 📝 Notes

- The ESP32 folder is intentionally left untouched for hardware display purposes
- The display page (`/display`) is optimized for 1024x600 resolution
- Touch gestures work with both touch and mouse input
- The calendar auto-refreshes to show the latest events
- All times are displayed in German format (24-hour clock)

---

**Enjoy your Family Calendar! 🎉**
