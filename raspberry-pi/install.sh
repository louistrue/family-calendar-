#!/bin/bash
# Family Calendar - Raspberry Pi Installation Script
# This script installs and configures the family calendar on a Raspberry Pi

set -e  # Exit on error

echo "======================================"
echo "Family Calendar - Raspberry Pi Setup"
echo "======================================"
echo ""

# Check if running on Raspberry Pi
if [ ! -f /proc/device-tree/model ] || ! grep -q "Raspberry Pi" /proc/device-tree/model; then
    echo "⚠️  Warning: This doesn't appear to be a Raspberry Pi"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Update system
echo "📦 Updating system packages..."
sudo apt-get update
sudo apt-get upgrade -y

# Install Node.js (if not already installed)
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "✅ Node.js already installed ($(node -v))"
fi

# Install required packages
echo "📦 Installing required packages..."
sudo apt-get install -y \
    git \
    chromium \
    x11-xserver-utils \
    unclutter \
    xdotool

# Install VNC server (optional, but recommended)
echo "📦 Installing VNC server..."
sudo apt-get install -y realvnc-vnc-server realvnc-vnc-viewer

# Enable VNC
echo "🔧 Enabling VNC..."
sudo raspi-config nonint do_vnc 0

# Get installation directory
INSTALL_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
echo "📁 Installation directory: $INSTALL_DIR"

# Navigate to API directory
cd "$INSTALL_DIR/api"

# Install dependencies
echo "📦 Installing Node.js dependencies..."
npm install

# Build the application
echo "🔨 Building application..."
npm run build

# Create .env file if it doesn't exist
if [ ! -f "$INSTALL_DIR/api/.env" ]; then
    echo "📝 Creating .env file..."
    cp "$INSTALL_DIR/api/.env.example" "$INSTALL_DIR/api/.env"
    echo ""
    echo "⚠️  IMPORTANT: Please edit $INSTALL_DIR/api/.env with your calendar URLs and API key"
    echo ""
fi

# Install systemd service
echo "🔧 Installing systemd service..."
sudo cp "$INSTALL_DIR/raspberry-pi/family-calendar.service" /etc/systemd/system/
sudo sed -i "s|/home/pi/family-calendar|$INSTALL_DIR|g" /etc/systemd/system/family-calendar.service
sudo sed -i "s|User=pi|User=$USER|g" /etc/systemd/system/family-calendar.service
sudo systemctl daemon-reload
sudo systemctl enable family-calendar.service

# Install autostart for kiosk mode
echo "🔧 Installing kiosk autostart..."
mkdir -p ~/.config/autostart
cp "$INSTALL_DIR/raspberry-pi/kiosk-autostart.desktop" ~/.config/autostart/family-calendar.desktop

# Get API key for kiosk URL
echo ""
echo "📋 Please enter your API key for the display URL:"
read -p "API Key: " API_KEY

# Update kiosk URL in autostart file
if [ -n "$API_KEY" ]; then
    sed -i "s|YOUR_API_KEY_HERE|$API_KEY|g" ~/.config/autostart/family-calendar.desktop
    echo "✅ Kiosk URL configured"
else
    echo "⚠️  No API key entered. You'll need to edit ~/.config/autostart/family-calendar.desktop manually"
fi

# Disable screen blanking
echo "🔧 Disabling screen blanking..."
mkdir -p ~/.config/lxsession/LXDE-pi
cat > ~/.config/lxsession/LXDE-pi/autostart <<EOF
@lxpanel --profile LXDE-pi
@pcmanfm --desktop --profile LXDE-pi
@xscreensaver -no-splash
@xset s off
@xset -dpms
@xset s noblank
EOF

echo ""
echo "======================================"
echo "✅ Installation Complete!"
echo "======================================"
echo ""
echo "Next steps:"
echo "1. Edit $INSTALL_DIR/api/.env with your calendar URLs and API secret"
echo "2. Start the service: sudo systemctl start family-calendar"
echo "3. Check status: sudo systemctl status family-calendar"
echo "4. View logs: sudo journalctl -u family-calendar -f"
echo "5. Reboot to start kiosk mode: sudo reboot"
echo ""
echo "VNC Access:"
echo "- VNC is enabled and will start automatically"
echo "- Connect using VNC Viewer to: $(hostname -I | awk '{print $1}')"
echo "- Default VNC password can be set with: sudo vncpasswd"
echo ""
