/**
 * Server-Sent Events endpoint streaming live `Activity` events to the client.
 *
 * - Auth: existing iron-session cookie via `getSession()`.
 * - RBAC: events filtered to projects the user can see (admin → all).
 * - Heartbeat: `event: ping` every 25s to keep proxies/Cloudflare alive.
 * - Cleanup: subscriber + timer torn down when the request is aborted.
 *
 * Client integration: see `src/hooks/useActivityStream.ts`.
 *
 * Refer to docs/ROADMAP.md → Feature 5 for transport rationale.
 */
import type { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  subscribe,
  subscriberCount,
  type ActivityEvent,
  type ActivityFilter,
} from '@/lib/activityBus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEARTBEAT_MS = 25_000;

const rawMaxClients = Number(process.env.ACTIVITY_STREAM_MAX_CLIENTS);
const MAX_CLIENTS =
  Number.isFinite(rawMaxClients) && rawMaxClients > 0 ? rawMaxClients : 200;

if (!Number.isFinite(rawMaxClients) || rawMaxClients <= 0) {
  // Warn once at module init if the configured cap is invalid
  console.warn(
    'Invalid ACTIVITY_STREAM_MAX_CLIENTS value "%s"; defaulting to %d',
    process.env.ACTIVITY_STREAM_MAX_CLIENTS,
    MAX_CLIENTS,
  );
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(req: NextRequest) {
  if (process.env.ACTIVITY_STREAM_ENABLED === 'false') {
    return new Response('Stream disabled', { status: 503 });
  }
  const session = await getSession();
  if (!session.userId) return new Response('Unauthenticated', { status: 401 });

  if (subscriberCount() >= MAX_CLIENTS) {
    return new Response('Stream at capacity', { status: 503 });
  }

  // Build the project allow-list once at connection time.
  const filter: ActivityFilter = await buildFilter(session.userId, session.role);

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const safeEnqueue = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      // Initial hello + retry hint (browser will wait 5s before reconnecting)
      safeEnqueue(`retry: 5000\n\n`);
      safeEnqueue(sse('hello', { ok: true, at: new Date().toISOString() }));

      unsubscribe = subscribe(filter, (evt: ActivityEvent) => {
        safeEnqueue(sse('activity', evt));
      });

      heartbeat = setInterval(() => {
        safeEnqueue(sse('ping', { t: Date.now() }));
      }, HEARTBEAT_MS);

      const cleanup = () => {
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = null;
        if (unsubscribe) unsubscribe();
        unsubscribe = null;
        try { controller.close(); } catch { /* already closed */ }
      };

      // Abort on client disconnect.
      req.signal.addEventListener('abort', cleanup);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (unsubscribe) unsubscribe();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

async function buildFilter(userId: string, role?: string): Promise<ActivityFilter> {
  if (role === 'ADMIN') return { projectIds: '*' };
  const projects = await prisma.project.findMany({
    where: {
      OR: [
        { managerId: userId },
        { members: { some: { userId } } },
      ],
    },
    select: { id: true },
  });
  return { projectIds: projects.map((p) => p.id) };
}
