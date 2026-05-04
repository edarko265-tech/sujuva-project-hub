# Continue on MacBook — Handoff Prompt

Use the prompt below in a fresh Copilot / Claude / ChatGPT chat on your MacBook
**after** you have cloned the repo and opened it in VS Code.

---

## 0. Bootstrap (run these before opening the AI chat)

```bash
# 1. Install prereqs (Homebrew assumed; install from https://brew.sh if missing)
brew install git node gh
gh auth login            # choose: GitHub.com → HTTPS → login with browser

# 2. Clone the repo
mkdir -p ~/Projects && cd ~/Projects
gh repo clone edarko265-tech/sujuva-project-hub
cd sujuva-project-hub

# 3. Restore the .env file (NOT in git — recreate it locally)
cp .env.example .env
# then open .env and fill in the real secrets:
#   OPENAI_API_KEY        — create a new one at https://platform.openai.com/api-keys
#   TELEGRAM_BOT_TOKEN    — re-issue with @BotFather /revoke + /token, or reuse existing
#   SESSION_SECRET        — any 64-char random string: `openssl rand -hex 32`
#   TELEGRAM_WEBHOOK_SECRET — any random string you choose

# 4. Open in VS Code
code .
```

---

## 1. Paste this prompt into Copilot Chat (Agent mode) on the Mac

> I am continuing work on the **Sujuva Project Hub**, a Next.js 14 (App Router,
> TypeScript strict, standalone output) personal project-management hub backed
> by Prisma + SQLite. The repo is already cloned at the workspace root, default
> branch `main`, remote `edarko265-tech/sujuva-project-hub`.
>
> **Context:** All app code, Prisma schema, Telegram webhook integration,
> brand assets (in `brand/`), Docker config, and a full technical roadmap
> (`docs/ROADMAP.md`) are already committed. WhatsApp has been removed; the
> only chat channel is Telegram. The previous Windows machine has Node.js
> blocked by UAC, so **nothing has been `npm install`-ed yet** — this is the
> first machine to actually run the app.
>
> **Please do the following, in order, and stop after each major step so I can
> verify:**
>
> 1. **Verify environment**: `node -v` (need ≥ 20), `npm -v`, `git --version`,
>    `gh auth status`. If Node < 20, install via `brew install node@20` and
>    `brew link --overwrite node@20`.
> 2. **Confirm `.env` is populated**: read `.env.example` and `.env`, list any
>    placeholder values still present in `.env`. Do NOT print the real secret
>    values back to me — just say "set" / "missing" per key.
> 3. **Install dependencies**: `npm install --no-audit --no-fund`.
> 4. **Initialize the database**:
>    ```bash
>    npx prisma generate
>    npx prisma migrate dev --name init
>    npm run prisma:seed
>    ```
>    Confirm `dev.db` was created and the seed user `admin@sujuva.local` exists.
> 5. **Smoke-test the dev server**: start `npm run dev` in a background terminal,
>    wait for "Ready", then `curl -I http://localhost:3000` and report the
>    status. Login credentials are `admin@sujuva.local` / `admin123`.
> 6. **Optional — wire up Telegram webhook** (only if I confirm I want to test
>    it now): use ngrok or a Cloudflare tunnel to expose `localhost:3000`,
>    then call `https://api.telegram.org/bot<TOKEN>/setWebhook?url=<TUNNEL>/api/integrations/telegram/<TELEGRAM_WEBHOOK_SECRET>`.
> 7. **Read `docs/ROADMAP.md`** end-to-end and summarise the 5 planned features
>    in one sentence each. Then ask me which feature I want to implement first
>    (the recommended order in the doc is: SSE activity stream → attachments →
>    LLM brain-dump → Telegram digest → Gantt).
>
> **Constraints:**
> - Use `pnpm` only if it's already installed; otherwise stick with `npm` to
>   match the lockfile.
> - Do not run `prisma migrate reset` or delete `dev.db` without asking.
> - Do not commit `.env`, `dev.db`, or anything in `node_modules/`.
> - Keep all changes on a feature branch, not directly on `main`.
> - When implementing roadmap features, follow the schema deltas, env vars,
>   and module layout exactly as specified in `docs/ROADMAP.md`.
>
> Start with step 1.

---

## 2. Notes on secrets

The previous PAT and OpenAI key were rotated. You will need to create new ones
on the Mac:

| Secret | Where to get a new one |
|---|---|
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys |
| `TELEGRAM_BOT_TOKEN` | DM `@BotFather` → `/mybots` → select bot → API Token (or `/revoke` to rotate) |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `TELEGRAM_WEBHOOK_SECRET` | `openssl rand -hex 16` (any string you pick) |
| GitHub auth | `gh auth login` — no PAT in shell required |

---

## 3. If something is missing

If the Mac chat agent says a file or module is missing, ask it to:

```
git log --oneline -20
git status
ls -la docs/ src/lib/ src/app/api/integrations/telegram/
```

…to confirm it's looking at the same commit (`e71b376` or later on `main`).

---

## 4. Where to resume the roadmap

After the smoke test passes, the recommended first feature to implement is
**Feature 5 — Real-time activity feed (SSE first)** because it unblocks
visible UX improvements without requiring any external infrastructure.
See [`ROADMAP.md` → Feature 5](./ROADMAP.md#feature-5--real-time-activity-feed-websocketsse).
