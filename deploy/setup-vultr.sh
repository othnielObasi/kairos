#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/kairos"
APP_USER="kairos"
REPO="https://github.com/othnielObasi/kairos.git"
NODE_MAJOR=22

echo "========================================"
echo "  Kairos - Vultr Server Setup"
echo "========================================"

echo "[1/7] Updating system..."
apt-get update -y && apt-get upgrade -y
apt-get install -y curl git rsync ufw software-properties-common

echo "[2/7] Configuring firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw --force enable

echo "[3/7] Installing Node.js ${NODE_MAJOR}..."
curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash -
apt-get install -y nodejs
npm install -g pm2

echo "[4/7] Setting up application..."
id -u "$APP_USER" &>/dev/null || useradd -m -s /bin/bash "$APP_USER"
mkdir -p "$APP_DIR/logs"
git clone "$REPO" "$APP_DIR/repo" || (cd "$APP_DIR/repo" && git pull origin main)
cp -r "$APP_DIR/repo/." "$APP_DIR/"
rm -rf "$APP_DIR/repo"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "[5/7] Installing Node dependencies..."
cd "$APP_DIR"
# PM2 runs the runtime through `npx tsx`, so devDependencies must exist on-box.
sudo -u "$APP_USER" npm install

echo "[6/7] Installing cloudflared..."
curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb
dpkg -i /tmp/cloudflared.deb
rm /tmp/cloudflared.deb

echo "[7/7] Creating Arc/Circle .env template..."
if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
fi

echo
echo "========================================"
echo "  Server setup complete"
echo
echo "  Next steps:"
echo "  1. Edit /opt/kairos/.env with Arc, Circle, and IPFS values"
echo "  2. Run:  bash /opt/kairos/deploy/setup-tunnel.sh"
echo "  3. Start: cd /opt/kairos && pm2 start ecosystem.config.cjs"
echo "  4. Save:  pm2 save && pm2 startup"
echo "========================================"
