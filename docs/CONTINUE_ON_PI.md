# Continue on Raspberry Pi — Handoff Prompt

Use this **after** you have:
- A Raspberry Pi 4/5 (8 GB recommended) running **Raspberry Pi OS Lite (64-bit, Bookworm)**
- SSH access (`ssh pi@sujuva-pi.local` or similar)
- The repo pushed to GitHub on branch `feat/sse-activity-stream` (or merged to `main`)

> **Architecture note:** All app code is portable Node.js/Next.js with SQLite —
> no native deps that struggle on ARM. Bcrypt, Prisma, and `better-sqlite3`
> all ship arm64 prebuilds. Expect first-run install ≈ 3–5 min on a Pi 5,
> 6–10 min on a Pi 4.

---

## 0. One-time host bootstrap (run on the Pi over SSH)

```bash
# --- system packages ---
sudo apt update && sudo apt -y upgrade
sudo apt -y install git curl ca-certificates ufw fail2ban

# --- Node.js 22 LTS (NodeSource arm64 build) ---
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt -y install nodejs
node -v && npm -v   # expect v22.x and 10.x

# --- (optional but recommended) move npm cache off SD card if you have an SSD/USB ---
# npm config set cache /mnt/ssd/.npm

# --- firewall: allow SSH + the app port (3000 dev, 80/443 prod) ---
sudo ufw allow OpenSSH
sudo ufw allow 3000/tcp     # dev
# sudo ufw allow 80,443/tcp # prod (only after Caddy/Nginx is set up)
sudo ufw --force enable
```

---

## 1. Clone & install

```bash
mkdir -p ~/apps && cd ~/apps
git clone https://github.com/edarko265-tech/sujuva-project-hub.git
cd sujuva-project-hub

# pick the latest branch you pushed (currently feat/sse-activity-stream;
# switch to main once it's merged)
git checkout feat/sse-activity-stream   # or: git checkout main

# YOU will create .env yourself per the request — see § 2 below for required keys
nano .env

npm ci --no-audit --no-fund
npx prisma generate
npx prisma migrate deploy        # use 'deploy' (not 'dev') in production
npm run prisma:seed              # creates admin@sujuva.local / admin123 — change immediately
```

> If the device doesn't have enough RAM for `next build` (Pi 4 with 4 GB
> sometimes OOMs), add a swap file once: `sudo dphys-swapfile swapoff &&
> sudo sed -i 's/^CONF_SWAPSIZE=.*/CONF_SWAPSIZE=2048/' /etc/dphys-swapfile
> && sudo dphys-swapfile setup && sudo dphys-swapfile swapon`.

---

## 2. `.env` — keys you must populate (you said you'll do this yourself)

| Key | Required? | How to get it |
|---|---|---|
| `DATABASE_URL` | yes | `file:./dev.db` (SQLite) — fine for Pi |
| `SESSION_SECRET` | yes | `openssl rand -hex 32` |
| `OPENAI_API_KEY` | optional | https://platform.openai.com/api-keys (chatbot returns mocks if blank) |
| `OPENAI_MODEL` | optional | default `gpt-4o-mini` |
| `TELEGRAM_BOT_TOKEN` | optional | from `@BotFather` |
| `TELEGRAM_WEBHOOK_URL` | only if exposing Telegram | public HTTPS base, e.g. `https://hub.example.com` |
| `TELEGRAM_WEBHOOK_SECRET` | only if exposing Telegram | `openssl rand -hex 16` |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | first run only | seed values |
| `ACTIVITY_STREAM_ENABLED` | optional | `true` (default) |
| `ACTIVITY_STREAM_MAX_CLIENTS` | optional | `200` (default) |

After editing: `chmod 600 .env` so only your user can read it.

---

## 3. Run it

### 3a. Quick smoke (dev mode)

```bash
npm run dev
# in another terminal: curl -I http://localhost:3000/login   → expect 200
```

Browse from your laptop on the same LAN: `http://sujuva-pi.local:3000`.

### 3b. Production mode (recommended for a "real" install)

```bash
npm run build      # builds the standalone Next.js bundle
npm start          # runs on PORT=3000 by default; set PORT=8080 to change
```

### 3c. Run as a systemd service (auto-restart, starts at boot)

```bash
sudo tee /etc/systemd/system/sujuva.service >/dev/null <<'EOF'
[Unit]
Description=Sujuva Project Hub
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/apps/sujuva-project-hub
EnvironmentFile=/home/pi/apps/sujuva-project-hub/.env
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=5
# SSE keeps connections open; bump default fd limit
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now sujuva
sudo systemctl status sujuva --no-pager | head -15
journalctl -u sujuva -f          # live logs
```

---

## 4. Reverse proxy + HTTPS (so Telegram webhooks work)

The simplest path is **Caddy** — it auto-provisions Let's Encrypt certs.

```bash
# install caddy
sudo apt -y install debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt -y install caddy

sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
hub.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000 {
        # SSE: disable buffering and bump idle timeouts
        flush_interval -1
        transport http {
            response_header_timeout 5m
            read_buffer 16KB
        }
    }
}
EOF

sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo systemctl reload caddy
```

Point your domain (or DuckDNS / Cloudflare Tunnel) at the Pi's public IP.
Caddy fetches the cert on first request.

> **Cloudflare Tunnel alternative** (no port forwarding needed):
> `cloudflared tunnel --url http://localhost:3000` — handy for testing the
> Telegram webhook from a residential connection without opening ports.

---

## 5. Wire the Telegram webhook (after HTTPS is live)

```bash
TOKEN=...              # value of TELEGRAM_BOT_TOKEN
SECRET=...             # value of TELEGRAM_WEBHOOK_SECRET
BASE=https://hub.example.com   # your public URL

curl -s "https://api.telegram.org/bot${TOKEN}/setWebhook?url=${BASE}/api/integrations/telegram/${SECRET}"
# → {"ok":true,"result":true,"description":"Webhook was set"}
```

Send your bot a message → check `journalctl -u sujuva -f` for the inbound POST.

---

## 6. Smoke checklist before declaring victory

- [ ] `curl -I https://hub.example.com/login` → `200`
- [ ] Login as the seeded admin, immediately change password / create your real user
- [ ] Open the dashboard in two browser tabs; create a project in tab A → the
      "Recent activity" panel in tab B updates within ~2 s and shows
      **"Live"** in green (this validates the new SSE stream — Roadmap #5)
- [ ] `curl https://api.telegram.org/bot${TOKEN}/getWebhookInfo` →
      `pending_update_count` returns to 0 after sending a message
- [ ] `systemctl is-enabled sujuva` → `enabled`
- [ ] Reboot the Pi (`sudo reboot`); confirm the site comes back automatically

---

## 7. Backups (do this once, thank yourself later)

`prisma/dev.db` is the entire data store. Add a nightly cron:

```bash
mkdir -p ~/backups
crontab -l 2>/dev/null | { cat; echo '15 3 * * * sqlite3 /home/pi/apps/sujuva-project-hub/prisma/dev.db ".backup /home/pi/backups/sujuva-$(date +\%F).db" && find /home/pi/backups -name "sujuva-*.db" -mtime +14 -delete'; } | crontab -
```

(Once Feature 1 — file attachments — ships, also rsync `STORAGE_LOCAL_DIR`
to the same place, or push both to S3/Backblaze with `restic`.)

---

## 8. Updating the app later

```bash
cd ~/apps/sujuva-project-hub
git pull
npm ci --no-audit --no-fund
npx prisma migrate deploy
npm run build
sudo systemctl restart sujuva
```

---

## 9. Resume the AI prompt

Once steps 1–3 pass, paste this into Copilot / Claude on the Pi (or back on
the Mac with SSH workspace, your call):

> I am continuing the **Sujuva Project Hub** on a Raspberry Pi production
> host. The SSE activity stream (Roadmap #5) is live and verified. The next
> feature is **#1 — File attachments via S3 / Azure / local driver** as
> specified in `docs/ROADMAP.md` §1. The local filesystem driver should be
> the default (`STORAGE_BACKEND=local`, `STORAGE_LOCAL_DIR=./uploads`) so the
> Pi can serve attachments without an external bucket. Please:
>
> 1. Create a feature branch `feat/attachments-local-driver`.
> 2. Implement the Prisma `Attachment` model + migration `add_attachments`.
> 3. Scaffold `src/lib/storage/{index,types,local}.ts` per ROADMAP §1.6.
> 4. Implement `POST /api/attachments/presign`, `POST /api/attachments/:id/confirm`,
>    `GET /api/attachments/:id/download`, `DELETE /api/attachments/:id`.
>    For the local driver, the "presigned URL" is a short-lived signed-JWT
>    route on this same app.
> 5. Add the drag-and-drop zone to the feature drawer in
>    `src/app/(app)/projects/[id]/detail-client.tsx`.
> 6. Wire the new env vars (`STORAGE_BACKEND`, `STORAGE_LOCAL_DIR`,
>    `UPLOAD_MAX_MB`, `UPLOAD_ALLOWED_MIME`) into `.env.example` and
>    `docker-compose.yml`.
> 7. Stop after each numbered step so I can test, and never commit to `main`
>    directly — open a PR via `gh pr create`.

---

## 10. Common Pi gotchas

- **`EACCES` writing `dev.db`**: SQLite needs write access to the *directory*
  holding the file (for the `-journal` file). `chmod 750 prisma/`.
- **`next build` killed (OOM)**: see swap instructions in §1.
- **SSE drops every 60 s**: a router/ISP idle timeout. Caddy is configured
  above with `response_header_timeout 5m`. If using Cloudflare's free tier
  in front, note the 100 s WebSocket/SSE limit — the client auto-reconnects
  thanks to `useActivityStream`'s built-in `EventSource` retry.
- **Prisma "engine not found"**: run `npx prisma generate` after every
  `npm ci` (it's already in the `postinstall` hook, so usually automatic).
- **Time skew breaks Telegram webhook signatures**: `sudo timedatectl
  set-ntp true`.

---

When you're back, ping me with one of:
- "Pi is up at <URL>, let's start File Attachments" → I'll create
  `feat/attachments-local-driver` and start at step 2 of the roadmap.
- "Hit a snag on step X" → paste the error, I'll triage.
