#!/usr/bin/env bash
# AWS EC2 (Ubuntu 24.04) bootstrap for Sujuva Project Hub.
# Run on a fresh instance as the default `ubuntu` user:
#   curl -fsSL https://raw.githubusercontent.com/edarko265-tech/sujuva-project-hub/main/scripts/aws-bootstrap.sh | bash
#
# Idempotent — safe to re-run. Reads optional env vars:
#   DOMAIN          (default: projects.ericdarko.com)
#   REPO_URL        (default: https://github.com/edarko265-tech/sujuva-project-hub.git)
#   APP_BRANCH      (default: main)
#   APP_USER        (default: sujuva)
#   APP_DIR         (default: /srv/sujuva-project-hub)

set -euo pipefail

DOMAIN="${DOMAIN:-projects.ericdarko.com}"
REPO_URL="${REPO_URL:-https://github.com/edarko265-tech/sujuva-project-hub.git}"
APP_BRANCH="${APP_BRANCH:-main}"
APP_USER="${APP_USER:-sujuva}"
APP_DIR="${APP_DIR:-/srv/sujuva-project-hub}"

log() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }

log "1/8 apt update + base packages"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ca-certificates curl gnupg ufw git build-essential debian-keyring debian-archive-keyring apt-transport-https sqlite3

log "2/8 Node.js 22 LTS (NodeSource)"
if ! command -v node >/dev/null || [[ "$(node -v)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v && npm -v

log "3/8 Caddy (official repo)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y caddy
fi

log "4/8 firewall (ufw): SSH + 80 + 443"
sudo ufw allow OpenSSH || true
sudo ufw allow 80/tcp || true
sudo ufw allow 443/tcp || true
sudo ufw --force enable

log "5/8 system user $APP_USER + clone repo to $APP_DIR"
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  sudo useradd --system --create-home --shell /bin/bash "$APP_USER"
fi
sudo mkdir -p "$APP_DIR"
sudo chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
if [[ ! -d "$APP_DIR/.git" ]]; then
  sudo -u "$APP_USER" git clone --branch "$APP_BRANCH" "$REPO_URL" "$APP_DIR"
else
  sudo -u "$APP_USER" git -C "$APP_DIR" fetch --all
  sudo -u "$APP_USER" git -C "$APP_DIR" checkout "$APP_BRANCH"
  sudo -u "$APP_USER" git -C "$APP_DIR" pull --ff-only
fi

log "6/8 .env (placeholders if missing) + npm ci + prisma + build"
if [[ ! -f "$APP_DIR/.env" ]]; then
  SECRET="$(openssl rand -base64 48 | tr -d '\n')"
  sudo -u "$APP_USER" tee "$APP_DIR/.env" >/dev/null <<EOF
DATABASE_URL="file:./prisma/prod.db"
SESSION_SECRET="$SECRET"
OPENAI_API_KEY=""
OPENAI_MODEL="gpt-4o-mini"
OPENAI_TRANSCRIBE_MODEL="whisper-1"
TELEGRAM_BOT_TOKEN=""
TELEGRAM_WEBHOOK_SECRET=""
SEED_ADMIN_EMAIL="admin@sujuva.local"
SEED_ADMIN_PASSWORD="admin123"
NODE_ENV=production
PORT=3000
EOF
  sudo chmod 600 "$APP_DIR/.env"
  echo "  ⚠️  /srv/sujuva-project-hub/.env created with placeholders."
  echo "      Edit it and set OPENAI_API_KEY before/after first start."
fi
sudo -u "$APP_USER" bash -lc "
  set -e
  cd '$APP_DIR'
  npm ci
  npx prisma migrate deploy
  npx prisma db seed || true
  npm run build
"

log "7/8 systemd unit"
sudo tee /etc/systemd/system/sujuva.service >/dev/null <<EOF
[Unit]
Description=Sujuva Project Hub (Next.js)
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=/usr/bin/npm run start -- -p 3000
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now sujuva
sleep 2
sudo systemctl --no-pager status sujuva | head -n 15 || true

log "8/8 Caddyfile + reload"
sudo tee /etc/caddy/Caddyfile >/dev/null <<EOF
$DOMAIN {
    encode zstd gzip

    # Long timeouts so Server-Sent Events on /api/stream don't drop.
    @sse path /api/stream*
    reverse_proxy @sse 127.0.0.1:3000 {
        flush_interval -1
        transport http {
            read_timeout 24h
            write_timeout 24h
        }
    }

    reverse_proxy 127.0.0.1:3000

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options    "nosniff"
        X-Frame-Options           "SAMEORIGIN"
        Referrer-Policy           "strict-origin-when-cross-origin"
    }
}
EOF
sudo systemctl enable --now caddy
sudo systemctl reload caddy || sudo systemctl restart caddy

cat <<EOF

✅ Bootstrap complete.

Domain:   https://$DOMAIN
App dir:  $APP_DIR
User:     $APP_USER
Service:  sudo systemctl {status,restart,stop} sujuva
Logs:     sudo journalctl -u sujuva -f

Next steps:
  1. Edit  $APP_DIR/.env  (set OPENAI_API_KEY)
  2. sudo systemctl restart sujuva
  3. Open  https://$DOMAIN  → log in → change admin password.

EOF
