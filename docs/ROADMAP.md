# Sujuva Project Hub — Future Roadmap & Technical Plan

This document captures the design, technical approach, data-model deltas, security
considerations, and step-by-step implementation plan for the next round of features
on the Sujuva Project Hub. It is the contract between product intent and engineering
execution — keep it up to date as items land.

| # | Feature | Priority | Effort | Status |
|---|---|---|---|---|
| 1 | File attachments via S3 / Azure Blob | High | M | Planned |
| 2 | Telegram digest of weekly progress | High | S | Planned |
| 3 | Per-project Gantt view | Medium | M | Planned |
| 4 | Replace heuristic brain-dump parser with full LLM call | Medium | S | Planned |
| 5 | Real WebSocket activity feed | Medium | M | Planned |

Effort key: **S** ≈ 1–2 days, **M** ≈ 3–5 days, **L** ≈ 1–2 weeks.

---

## Conventions used in this document

- **Schema deltas** are shown as `prisma/schema.prisma` snippets to add/extend.
- **API routes** follow the existing `src/app/api/<resource>/route.ts` shape with
  `handleError(e)` from [src/app/api/projects/route.ts](../src/app/api/projects/route.ts).
- **RBAC** decisions reuse helpers in [src/lib/rbac.ts](../src/lib/rbac.ts).
- All new env vars must also be added to [.env.example](../.env.example) and
  [docker-compose.yml](../docker-compose.yml).
- Every feature must ship with: types, server validation (`zod`), at least one
  happy-path test, README update, and an entry in `docs/CHANGELOG.md`.

---

## 1. File attachments via S3 / Azure Blob

### 1.1 Goal
Allow users to attach files (specs, images, PDFs, screenshots) to **features**,
**comments**, and **brain-dumps**. Storage must be pluggable — the same code path
works against AWS S3, Azure Blob Storage, or a local-filesystem driver for dev.

### 1.2 User stories
- As a **contributor** I can drag-and-drop a file onto a feature card and have it
  uploaded directly to object storage (no proxying through Next.js).
- As a **viewer** I can preview images and PDFs inline and download other types.
- As an **admin** I can configure storage backend + bucket via env vars without
  touching code.
- As a **manager** I can see total storage used per project (insights page).

### 1.3 Architecture
```
┌──────────┐    1) request URL     ┌────────────────┐
│ Browser  │──────────────────────▶│ Next.js API    │
│          │◀──── 2) presigned ────│ /api/uploads   │
│          │       PUT URL         └───────┬────────┘
│          │                               │ records
│          │      3) PUT file              │ Attachment
│          │──────────────────────▶┌───────┴────────┐
│          │                       │ Object storage │
│          │      4) confirm       │ (S3 / Azure)   │
│          │──────────────────────▶│                │
└──────────┘                       └────────────────┘
```

Direct browser → object-storage uploads via **presigned URLs**. The app server
never sees file bytes (good for Pi deployment).

### 1.4 Schema delta
```prisma
model Attachment {
  id          String   @id @default(cuid())
  // Polymorphic owner (exactly one set)
  featureId   String?
  commentId   String?
  brainDumpId String?

  uploaderId  String
  filename    String
  mimeType    String
  sizeBytes   Int
  storageKey  String   // backend-specific path/key, e.g. "features/<id>/<uuid>-spec.pdf"
  backend     String   // "s3" | "azure" | "local"
  status      String   @default("PENDING") // PENDING | READY | DELETED
  checksum    String?  // sha256, set after upload confirmation
  createdAt   DateTime @default(now())

  uploader    User      @relation(fields: [uploaderId], references: [id])
  feature     Feature?  @relation(fields: [featureId], references: [id], onDelete: Cascade)
  comment     Comment?  @relation(fields: [commentId], references: [id], onDelete: Cascade)
  brainDump   BrainDump?@relation(fields: [brainDumpId], references: [id], onDelete: Cascade)

  @@index([featureId])
  @@index([commentId])
  @@index([brainDumpId])
}
```
Add the inverse `attachments Attachment[]` relations on `Feature`, `Comment`,
`BrainDump`, and `User`.

### 1.5 New env vars
| Var | Purpose |
|---|---|
| `STORAGE_BACKEND` | `s3` \| `azure` \| `local` (default `local`) |
| `STORAGE_LOCAL_DIR` | Path used by local backend (default `./uploads`) |
| `S3_ENDPOINT` | Override for MinIO / R2 / non-AWS |
| `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | AWS / S3-compatible |
| `AZURE_STORAGE_ACCOUNT`, `AZURE_STORAGE_CONTAINER`, `AZURE_STORAGE_SAS_URL` *or* `AZURE_STORAGE_CONNECTION_STRING` | Azure Blob |
| `UPLOAD_MAX_MB` | Per-file limit (default `25`) |
| `UPLOAD_ALLOWED_MIME` | Comma-separated allow-list (default broad: images, pdf, docx, xlsx, txt, md, zip) |

### 1.6 New module — `src/lib/storage/`
```
src/lib/storage/
  index.ts        # exports the active driver based on STORAGE_BACKEND
  types.ts        # StorageDriver interface
  s3.ts           # uses @aws-sdk/client-s3 + @aws-sdk/s3-request-presigner
  azure.ts        # uses @azure/storage-blob (BlobSASPermissions.parse('w'))
  local.ts        # writes to STORAGE_LOCAL_DIR; presigned URL = signed JWT route
```

`StorageDriver` interface:
```ts
export interface PresignResult {
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  publicReadUrl?: string; // optional, mainly for previews
  storageKey: string;
}

export interface StorageDriver {
  presignUpload(args: { key: string; mimeType: string; sizeBytes: number }): Promise<PresignResult>;
  presignDownload(args: { key: string; filename?: string }): Promise<string>;
  delete(key: string): Promise<void>;
}
```

### 1.7 New API routes
| Method & path | Purpose |
|---|---|
| `POST /api/attachments/presign` | body: `{ ownerType, ownerId, filename, mimeType, sizeBytes }` → returns presign + creates `Attachment` row in `PENDING` |
| `POST /api/attachments/:id/confirm` | body: `{ checksum? }` → flips to `READY` |
| `GET  /api/attachments/:id/download` | redirects to a presigned download URL |
| `DELETE /api/attachments/:id` | soft-deletes (status=DELETED), schedules object cleanup |
| `GET /api/projects/:id/storage-usage` | sum of `sizeBytes` for READY rows under that project |

### 1.8 RBAC
- Upload: any role with edit access to the parent (use `canEditFeature` /
  membership check).
- Download: any role with view access.
- Delete: uploader, project manager, or admin.

### 1.9 UI changes
- **Feature drawer** ([src/app/(app)/projects/[id]/detail-client.tsx](../src/app/(app)/projects/[id]/detail-client.tsx)):
  add an "Attachments" section with drag-and-drop zone, thumbnails for images,
  PDF preview via `<iframe>`.
- **Comments**: small paperclip button next to the textarea.
- **Brain-dump**: optional file picker.
- **Insights**: new tile "Storage used" per project.

### 1.10 Security
- Server validates `mimeType` against `UPLOAD_ALLOWED_MIME` and
  `sizeBytes <= UPLOAD_MAX_MB * 1024 * 1024` before signing.
- Presigned URLs expire in 5 minutes (uploads) and 10 minutes (downloads).
- Bucket / container blocked from public list; ACL = private.
- Filenames sanitised; `storageKey` is `{ownerType}/{ownerId}/{uuid}{ext}`.
- Confirm endpoint verifies the object actually exists (HEAD request) before
  setting `READY`.

### 1.11 Implementation steps
1. Add Prisma model + migration `add_attachments`.
2. Add storage driver scaffolding + `local` driver, wire feature flag.
3. Build presign + confirm + download endpoints.
4. Build the feature-drawer UI with optimistic state.
5. Add `s3` driver behind a unit test using `aws-sdk-client-mock`.
6. Add `azure` driver tested against Azurite (docker-compose dev profile).
7. Insights tile + storage-usage endpoint.
8. README & `.env.example` updates.

---

## 2. Telegram digest of weekly progress

### 2.1 Goal
Every Monday 08:00 in each user's timezone, send a personalised Telegram message
summarising the previous week across the projects they can see: % movement,
features completed, blocked items, stale features.

### 2.2 Architecture
- Cron driven by **a single scheduler** (no per-user cron). Default uses
  `node-cron` inside the Next.js node runtime (started in `instrumentation.ts`).
- For multi-instance deploys (k8s, Container Apps), can be flipped to
  external trigger: `POST /api/cron/digest` protected by `CRON_SECRET`.
- Idempotency key: `digest:{userId}:{ISOWeek}` stored in `Setting` to prevent
  duplicate sends if the cron fires twice.

### 2.3 Schema delta
```prisma
model User {
  // ...existing fields...
  telegramChatId    String?
  telegramTimezone  String   @default("UTC")     // IANA TZ
  digestEnabled     Boolean  @default(true)
  digestDayOfWeek   Int      @default(1)         // 0=Sun..6=Sat
  digestHourLocal   Int      @default(8)
}

model DigestRun {
  id        String   @id @default(cuid())
  userId    String
  weekKey   String   // e.g. "2026-W18"
  sentAt    DateTime @default(now())
  channel   String   // "telegram"
  payloadJson String

  user      User @relation(fields: [userId], references: [id])
  @@unique([userId, weekKey, channel])
}
```

### 2.4 New env vars
- `CRON_ENABLED` — `true` for single-instance deploys, `false` for external.
- `CRON_SECRET` — bearer used by `POST /api/cron/digest`.
- `DEFAULT_TZ` — fallback IANA timezone.

### 2.5 Modules
- `src/lib/cron.ts` — registers a `node-cron` schedule that runs every 15 min
  and dispatches digests for any user whose local time matches their preferences.
- `src/lib/digest.ts`
  - `buildWeeklyDigest(userId): Promise<DigestPayload>`
  - `formatDigestForTelegram(payload): string` (Markdown)
- `src/app/api/cron/digest/route.ts` — POST handler for external schedulers.
- `src/app/(app)/admin/users/page.tsx` extension — toggle digest + edit TZ.

### 2.6 Digest contents (per user)
- Per accessible project:
  - Δ completion % (this week vs last week) — uses `DigestRun.payloadJson` from
    last run for diff baseline.
  - Features completed this week (count + top 3 titles).
  - Blocked features still open (count).
  - Features dueDate within next 7 days.
- Footer: link to dashboard, total accessible projects.

### 2.7 RBAC
- Digest only includes data the user already has read access to (re-uses the
  same query helpers as `/api/insights`).

### 2.8 Implementation steps
1. Schema migration + admin toggle UI.
2. `digest.ts` builder with snapshot-based week-over-week diff.
3. Telegram formatter + `sendTelegramMessage` reuse from
   [src/lib/telegram.ts](../src/lib/telegram.ts).
4. `cron.ts` + bootstrap from `instrumentation.ts`.
5. External `POST /api/cron/digest` for cloud deploys.
6. Test: run cron in mock mode, assert idempotency via `DigestRun` unique key.

---

## 3. Per-project Gantt view

### 3.1 Goal
Add a horizontal timeline view per project showing phases as rows and features as
bars, with start/end inferred from `createdAt` / `dueDate` and progress shading.

### 3.2 Schema delta
```prisma
model Feature {
  // ...existing fields...
  startDate DateTime?
  // dueDate already exists
}

model Phase {
  // ...existing fields...
  startDate DateTime?
  endDate   DateTime?
}
```

### 3.3 UI
- New route: `/projects/[id]/gantt`.
- Tab in the project detail page next to "Phases" and "Activity".
- Rendered with **`frappe-gantt-react`** (lightweight, MIT, ~30KB) or
  **`vis-timeline`** if interactive editing is needed later.
- Read-only in v1; editable bars in v1.1 behind a feature flag.

### 3.4 Data shape (server)
`GET /api/projects/:id/gantt` returns:
```ts
{
  phases: Array<{
    id: string; name: string; order: number;
    start: string; end: string;         // ISO; falls back to derived bounds
    features: Array<{
      id: string; title: string;
      start: string; end: string;
      progress: number;                  // 0..100
      status: FeatureStatus;
      assigneeName?: string;
    }>;
  }>;
  windowStart: string;
  windowEnd: string;
}
```

### 3.5 Derivation rules (when dates missing)
- Phase start = min(feature start within phase) or project createdAt.
- Phase end = max(feature dueDate within phase) or start + 7d.
- Feature start = `feature.startDate ?? feature.createdAt`.
- Feature end = `feature.dueDate ?? feature.startDate + 3d`.

### 3.6 Implementation steps
1. Schema migration `add_gantt_dates`.
2. Backend route + helper in `src/lib/gantt.ts`.
3. Install `frappe-gantt-react`, add wrapper component
   `src/components/GanttChart.tsx` (client component).
4. Page + tab; show empty state with CTA to set due dates if no data.
5. Print-friendly CSS.

---

## 4. Replace heuristic brain-dump parser with full LLM call

### 4.1 Goal
Today `brainDumpToProposal` in [src/lib/ai.ts](../src/lib/ai.ts) just splits on
the first sentence. Upgrade to a structured LLM call that returns:
- a concise feature title
- a refined description
- suggested project (from the user's accessible list)
- suggested phase (from that project's phases)
- suggested priority + tags
- estimated effort (S/M/L)

### 4.2 Architecture
- New function `proposeFromBrainDump(rawText, ctx)` in `src/lib/ai.ts`.
- Uses OpenAI structured outputs (`response_format: { type: 'json_schema' }` with
  a strict schema) when `OPENAI_API_KEY` is present; falls back to the existing
  heuristic when not.
- Schema-validated server-side with `zod` before persistence.

### 4.3 Schema delta
```prisma
model BrainDump {
  // ...existing fields...
  proposedProjectId String?
  proposedPriority  String?  // LOW | MEDIUM | HIGH | CRITICAL
  proposedTags      String?  // comma-separated
  proposedEffort    String?  // S | M | L
  llmModel          String?
  llmCostUsd        Float?
}
```

### 4.4 LLM contract (`response_format` JSON schema)
```jsonc
{
  "type": "object",
  "additionalProperties": false,
  "required": ["title","description","priority","effort"],
  "properties": {
    "title":       { "type": "string", "maxLength": 80 },
    "description": { "type": "string", "maxLength": 1500 },
    "projectId":   { "type": ["string","null"] },
    "phaseId":     { "type": ["string","null"] },
    "priority":    { "enum": ["LOW","MEDIUM","HIGH","CRITICAL"] },
    "tags":        { "type": "array", "items": {"type":"string"}, "maxItems": 6 },
    "effort":      { "enum": ["S","M","L"] }
  }
}
```

System prompt includes the user's `accessibleProjects` (id + name + phases) so
the model can pick a plausible target. The route revalidates that the picked
`projectId` / `phaseId` is in the user's allow-list before saving.

### 4.5 Cost & rate-limiting
- Tracks token usage in `BrainDump.llmCostUsd`.
- Per-user rate limit: 30 brain-dumps / hour (in-memory token bucket; Redis
  later if multi-instance).
- Falls back to heuristic if OpenAI errors twice in a row.

### 4.6 UI changes
- Brain-dump page shows a "Refine with AI" button → calls
  `POST /api/brain-dump/:id/refine` to recompute the proposal.
- The accept-flow lets the user override project/phase/priority before turning
  the brain-dump into a Feature.

### 4.7 Implementation steps
1. Schema migration + zod schema in `src/lib/schemas/brainDump.ts`.
2. Implement `proposeFromBrainDump` with structured output.
3. Update `POST /api/brain-dump` to call the new function.
4. Add `POST /api/brain-dump/:id/refine`.
5. UI changes + override controls.
6. Add fallback test (no API key → heuristic still works).

---

## 5. Real WebSocket activity feed

### 5.1 Goal
Replace polling on the dashboard / project detail with a real-time stream of
`Activity` events (creates, status changes, comments, brain-dumps, attachments).

### 5.2 Transport choice
Two viable options — choose based on hosting target:

| Option | Pros | Cons | Recommended for |
|---|---|---|---|
| **Server-Sent Events (SSE)** via `GET /api/stream` (Edge or Node runtime) | Works everywhere Next.js works, no extra server, plays nicely with Cloudflare/Vercel | One-way only, max ~6 connections per browser per origin | Pi / Vercel-style deploys |
| **WebSocket** via a small `ws` server attached in `instrumentation.ts` (Node only) | Bi-directional, lower latency | Not supported on Edge runtime; needs sticky sessions behind a load balancer | Self-hosted / Container Apps / k8s |

Plan: ship **SSE in v1** (lowest friction), keep the publisher abstracted so a
WebSocket transport can be added later without touching producers.

### 5.3 Architecture
```
Producers ──▶ ActivityBus.publish(event)
                     │
                     ▼
              ┌──────────────┐    in-memory by default
              │  ActivityBus │    Redis pub/sub if REDIS_URL set
              └──────┬───────┘
                     │ subscribe(filter)
                     ▼
        SSE handler ──▶ EventSource ──▶ React store
```

- `src/lib/activityBus.ts` exports `publish(event)` and `subscribe(filter, cb)`.
- In-memory `EventEmitter` for single instance.
- Optional Redis backend (`REDIS_URL`) using `ioredis` for multi-instance.
- All places that currently insert `Activity` rows ALSO call
  `activityBus.publish` with the same event — wrap in a tiny helper
  `recordActivity(...)`.

### 5.4 New env vars
- `REDIS_URL` (optional)
- `ACTIVITY_STREAM_ENABLED` (default `true`)

### 5.5 New API route
`GET /api/stream` (Node runtime, `dynamic = 'force-dynamic'`):
- Auth via existing `getSession`.
- Sends `text/event-stream`.
- Filters events to those the user can see (project membership / role check).
- Heartbeat every 25s (`event: ping`).
- Closes on client disconnect (use `req.signal`).

### 5.6 Client integration
- New hook `src/hooks/useActivityStream.ts` opens an `EventSource` to
  `/api/stream`, dispatches events into a Zustand or React Context store.
- Dashboard "Recent activity" list and project detail timeline subscribe.
- Toast notifications (`sonner` or shadcn) for events affecting the current
  user (e.g. assigned to a feature, comment on something they own).

### 5.7 Backpressure & limits
- Max 1 connection per user per browser tab; reuse via shared worker not in scope.
- Server caps subscribers at `ACTIVITY_STREAM_MAX_CLIENTS` (default 200).
- Coalesce bursts: drop duplicates within 1s window keyed by `(type, entityId)`.

### 5.8 Implementation steps
1. Build `activityBus.ts` (in-memory) + `recordActivity` helper.
2. Refactor existing API routes to call `recordActivity` instead of inline
   `prisma.activity.create`.
3. Add `GET /api/stream` SSE endpoint + RBAC filter.
4. Client hook + dashboard wiring.
5. Toast notifications for "events about me".
6. Optional Redis backend behind `REDIS_URL` (use `ioredis`); add docker-compose
   profile `cache`.
7. Load test with 100 concurrent connections via `autocannon` or `k6`.

---

## Cross-cutting concerns

### Migrations & rollout
- Every schema delta lands as its own Prisma migration (`prisma migrate dev --name <slug>`).
- Use feature flags in `Setting` table for risky features (`feature.gantt`,
  `feature.attachments`, `feature.activity_stream`) so they can be toggled per
  deployment without redeploying.

### Observability
- Add `src/lib/log.ts` with a tiny `pino` wrapper (level via `LOG_LEVEL`).
- All new endpoints log: route, userId, durationMs, outcome.
- Counter/timer metrics via `prom-client` exposed at `GET /api/metrics`
  (admin-only).

### Testing baseline
- Unit tests: `vitest` for `lib/*`.
- Integration tests: `vitest` + a temp SQLite DB seeded fresh per test file.
- E2E (later): `playwright` covering login, create project, attach file,
  brain-dump → feature.

### Documentation
- Keep this file in sync — when a feature ships, move it from "Planned" to
  "Shipped" and link to the relevant PRs.
- Add a section to the main [README.md](../README.md) referencing this doc.

---

## Suggested execution order
1. **Real WebSocket activity feed (SSE first)** — unblocks UX wins for everything else.
2. **File attachments** — most-requested by end users.
3. **LLM brain-dump parser** — small, high perceived value.
4. **Telegram weekly digest** — needs #2's `recordActivity` plumbing for "files added" lines.
5. **Gantt view** — last, because it benefits from real start/due dates that get back-filled while the other features are in flight.
