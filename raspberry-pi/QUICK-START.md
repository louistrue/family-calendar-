# Family Calendar - Raspberry Pi Quick Start

## ⚡ 5-Minute Setup

### 1. Install
```bash
cd ~
git clone https://github.com/yourusername/family-calendar.git
cd family-calendar/raspberry-pi
./install.sh
```

### 2. Configure Calendars
```bash
nano ~/family-calendar/api/.env
```

Add your calendar URLs and API secret.

### 3. Set API Key for Display
```bash
nano ~/family-calendar/raspberry-pi/start-kiosk.sh
```

Change `API_KEY="YOUR_API_KEY_HERE"` to match your API_SECRET.

### 4. Start & Reboot
```bash
sudo systemctl start family-calendar
sudo reboot
```

Done! 🎉

---

## 📱 VNC Access

### Get IP Address
```bash
hostname -I
```

### Set VNC Password
```bash
sudo vncpasswd
```

### Connect from Tablet
- Install VNC Viewer app
- Connect to: `<ip-address>:5900`
- Enter VNC password

---

## 🔧 Common Commands

### Service Control
```bash
# Start/stop/restart
sudo systemctl start family-calendar
sudo systemctl stop family-calendar
sudo systemctl restart family-calendar

# View status
sudo systemctl status family-calendar

# View logs
sudo journalctl -u family-calendar -f
```

### Update Application
```bash
cd ~/family-calendar
git pull
cd api
npm install
npm run build
sudo systemctl restart family-calendar
```

---

## 🎨 Display Options

URL format:
```
http://localhost:3000/display?apiKey=KEY&view=WEEK&refresh=15
```

| Parameter | Options |
|-----------|---------|
| `view` | DAY, WEEK, MONTH |
| `refresh` | Minutes between updates |

Edit in: `~/family-calendar/raspberry-pi/start-kiosk.sh`

---

## 🐛 Quick Troubleshooting

### Service not starting?
```bash
sudo journalctl -u family-calendar -n 50
```

### Blank screen?
```bash
ps aux | grep chromium
~/family-calendar/raspberry-pi/start-kiosk.sh
```

### Screen blanking?
```bash
xset s off
xset -dpms
xset s noblank
```

---

## 📞 URLs

- **Display**: `http://localhost:3000/display?apiKey=YOUR_KEY`
- **Simulator**: `http://localhost:3000/simulator`
- **API**: `http://localhost:3000/api/calendar`

---

For detailed documentation, see: `raspberry-pi/README.md`
