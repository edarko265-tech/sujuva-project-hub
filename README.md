# Sujuva Project Hub

A self-hosted, branded project-management web app to take projects from **Approval → Completion** with editable phases, features/tasks, automatic progress, RBAC, AI-assisted brain-dump and chatbot, plus a Telegram bot integration. Optimised to run on a Raspberry Pi or any small Linux box, and just as happily in the cloud.

> Pre-seeded with the **VRKH / Tiedolla depot** project so you can explore immediately.

---

## ✨ Features

- **Project lifecycle** – fully editable phases (no fixed dropdown). Default template ships with the 11-phase Approval → Completion workflow used at Sujuva.
- **Auto progress** – each feature has a status + completion %; phases and projects roll up automatically.
- **Roles** – `ADMIN`, `MANAGER`, `CONTRIBUTOR`, `VIEWER`. Project-scoped membership overlays global role.
- **Insights dashboard** – risk, blockers, overdue, workload by user, progress per phase.
- **Brain Dump** – capture ideas in raw text; system proposes a structured feature you can accept into a phase.
- **Assistant** – chatbot bound to your project context. Uses OpenAI when `OPENAI_API_KEY` is set, else returns a deterministic mock so the UI works offline.
- **Telegram bot** – send `/status`, `/dump <idea>` and chat with the assistant from Telegram.
- **Branded** – Sujuva navy / gold / cream palette and logo throughout.
- **Single binary feel** – Next.js standalone build in Docker; SQLite by default, switchable to Postgres.

---

## 🧱 Stack

- Next.js 14 (App Router, standalone output) · React 18 · TypeScript
- Tailwind CSS (custom Sujuva palette)
- Prisma ORM (SQLite default; Postgres ready)
- iron-session cookies + bcryptjs
- Zod validation
- Optional OpenAI (chat completions)

---

## 🚀 Quick start (local dev)

```bash
# 1. install
npm install

# 2. configure env
cp .env.example .env
#   - SESSION_SECRET must be 32+ chars in production
#   - keep DATABASE_URL="file:./dev.db" for SQLite

# 3. database + seed
npx prisma migrate dev --name init
npm run prisma:seed

# 4. run
npm run dev
# open http://localhost:3000
# default login: admin@sujuva.local / admin123  (or whatever you set in .env)
```

---

## 🐳 Run in Docker (Pi or server)

```bash
cp .env.example .env   # edit secrets
docker compose up -d --build
# UI on http://<host>:3000
```

The container persists SQLite at the `hub-data` volume (`/data/dev.db`). To switch to Postgres, uncomment the `db` service in `docker-compose.yml`, change the provider in `prisma/schema.prisma` to `postgresql`, and set `DATABASE_URL=postgresql://hub:hubpass@db:5432/projecthub`.

### Raspberry Pi notes

- The `node:20-alpine` base image works on `arm64` (Pi 4 / Pi 5 with 64-bit Raspberry Pi OS).
- SQLite avoids needing a separate DB container.
- Bind to a tailnet / Cloudflare Tunnel / nginx reverse proxy and put TLS in front before exposing to the internet.

---

## ☁️ Deploy to the cloud

Any Node 20 host that can run `npm run build && node .next/standalone/server.js` works. For managed platforms:

- **Azure App Service / Container Apps** – build the Docker image (e.g. push to ACR) and point the app at it. Set the same env vars as `docker-compose.yml`. Use Azure Database for PostgreSQL Flexible Server in production.
- **Vercel** – works out of the box; switch `DATABASE_URL` to a hosted Postgres (Neon, Supabase, Azure) and run `prisma migrate deploy`.
- **Fly.io / Railway / Render** – same idea: provide env vars + persistent volume (or external DB).

In production, **always** override `SESSION_SECRET` and `SEED_ADMIN_PASSWORD`.

---

## 👥 Roles & permissions

| Capability | Admin | Manager | Contributor | Viewer |
|---|:-:|:-:|:-:|:-:|
| Manage users / phase templates / settings | ✅ | – | – | – |
| Create projects | ✅ | ✅ | – | – |
| Edit any project they manage / belong to | ✅ | ✅ (assigned) | own features only | – |
| Add/edit phases & features | ✅ | ✅ | – | – |
| Update assigned features (status, %) | ✅ | ✅ | ✅ | – |
| Brain dump & assistant | ✅ | ✅ | ✅ | view-only chat |
| Insights | ✅ | ✅ | ✅ | – |

Project-level membership (`ProjectMember.roleInProject`) takes precedence over global role for that project, so you can promote a contributor to manager on a single project without giving global power.

---

## 🧠 Brain dump → feature

1. Open **Brain Dump**, type the idea, optionally pick a project.
2. The system generates a proposed `title` + `description` (heuristic now; swap in the OpenAI prompt in `src/lib/ai.ts → brainDumpToProposal` for richer structuring).
3. Click **Accept as feature** and pick a phase – it becomes a `NOT_STARTED` feature on that phase, tagged via Activity log.

---

## 🤖 AI / ChatGPT integration

- Place your key in `.env`: `OPENAI_API_KEY=sk-...` (and optionally `OPENAI_MODEL=gpt-4o-mini`).
- All AI calls go through `src/lib/ai.ts → chat()`. Without a key it returns a deterministic mock so screenshots, demos and offline Pi installs still work.
- The assistant page (`/chatbot`) sends the conversation to `/api/chat`, which prepends a system prompt with current project context.

---

## 📲 Telegram bot

The bot lives in `src/lib/telegram.ts` + the webhook route `src/app/api/integrations/telegram/[secret]/route.ts`, glued through `src/lib/messageRouter.ts`.

1. Talk to **@BotFather** on Telegram and create a bot. Copy the token into `TELEGRAM_BOT_TOKEN`.
2. Pick a long random string and put it in `TELEGRAM_WEBHOOK_SECRET` (the bot will only accept POSTs whose URL contains that secret).
3. Set `TELEGRAM_WEBHOOK_URL` to the public HTTPS origin of this app (e.g. `https://hub.example.com`).
4. Register the webhook once:

   ```
   curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=<TELEGRAM_WEBHOOK_URL>/api/integrations/telegram/<TELEGRAM_WEBHOOK_SECRET>"
   ```

Supported commands:

- `/start` – greeting + linking instructions
- `/status` – list projects you can see and their completion %
- `/dump <idea>` – store the text as a brain-dump entry an admin can later promote to a feature
- Any other text – chat with the AI assistant (uses the same `OPENAI_API_KEY` as the web chatbot)

Link your Telegram chat to a hub user by setting your hub email in your Telegram **@username** field, or by having an admin set `User.telegramChatId` (future enhancement).

---

## 🗄️ Data model (overview)

```
User ─< ProjectMember >─ Project ─< Phase ─< Feature
                                     │
User (manager) ─────────────────────┘
Feature ─< Comment, Activity
BrainDump (author, optional project, proposed → ACCEPTED becomes Feature)
PhaseTemplate (admin-managed default phases)
```

See `prisma/schema.prisma` for full definitions.

---

## 🛠 Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build (standalone) |
| `npm start` | Run built app |
| `npm run prisma:migrate` | `prisma migrate dev` |
| `npm run prisma:seed` | Seed admin + VRKH demo project |
| `npm run db:push` | `prisma db push` (no migration files) |
| `npm run lint` | ESLint |

---

## 🔐 Security notes

- Replace `SESSION_SECRET` (32+ random chars) before going to production.
- Replace `SEED_ADMIN_PASSWORD` after first login (Users → Reset password).
- All API routes enforce auth + RBAC server-side; the client UI only hides controls.
- `.env` is git-ignored. Never commit secrets.

---

## 🧭 Roadmap ideas

- File attachments via S3/Azure Blob
- Email/Telegram digest of weekly progress
- Per-project Gantt view
- Replace heuristic brain-dump parser with full LLM call
- Real WebSocket activity feed

---

© Sujuva. Built for the **Tiedolla depot** programme and beyond.
