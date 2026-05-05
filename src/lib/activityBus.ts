/**
 * In-memory pub/sub for live `Activity` events.
 *
 * - Producers call {@link recordActivity} which writes to the DB **and**
 *   publishes the event to all live subscribers (e.g. the SSE stream).
 * - Consumers (the SSE handler) call {@link subscribe} with an optional
 *   filter to receive matching events; remember to call the returned
 *   `unsubscribe` when the connection closes.
 *
 * Uses a module-level singleton EventEmitter — survives Next.js dev HMR
 * via `globalThis` to avoid duplicate listeners on every reload.
 *
 * For multi-instance deploys, swap the underlying transport for Redis
 * pub/sub (see `docs/ROADMAP.md` Feature 5 §5.3) without touching producers.
 */
import { EventEmitter } from 'node:events';
import { prisma } from './prisma';
import type { Activity } from '@prisma/client';

export type ActivityEventType =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'COMMENT'
  | 'STATUS_CHANGE'
  | 'ASSIGN'
  | 'NOTE';

/** Wire format of a published activity event. Stable across transports. */
export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  message: string;
  projectId: string | null;
  featureId: string | null;
  actorId: string | null;
  actorName: string | null;
  createdAt: string; // ISO
}

export interface ActivityFilter {
  /** Limit events to these project IDs. `'*'` (or omitted) = all. */
  projectIds?: string[] | '*';
}

const CHANNEL = 'activity';
const COALESCE_WINDOW_MS = 1_000;
const MAX_LISTENERS = 500;

interface BusGlobal {
  emitter: EventEmitter;
  /** Recently emitted (type|entityId) keys for burst coalescing. */
  recent: Map<string, number>;
}

const g = globalThis as unknown as { __sujuvaActivityBus?: BusGlobal };
if (!g.__sujuvaActivityBus) {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(MAX_LISTENERS);
  g.__sujuvaActivityBus = { emitter, recent: new Map() };
}
const bus = g.__sujuvaActivityBus;

function shouldCoalesce(evt: ActivityEvent): boolean {
  const key = `${evt.type}|${evt.featureId ?? evt.projectId ?? evt.id}`;
  const now = Date.now();
  const last = bus.recent.get(key);
  bus.recent.set(key, now);
  // Light-weight cleanup
  if (bus.recent.size > 1024) {
    for (const [k, t] of bus.recent) if (now - t > COALESCE_WINDOW_MS * 4) bus.recent.delete(k);
  }
  return last !== undefined && now - last < COALESCE_WINDOW_MS;
}

/** Publish an already-persisted activity to live subscribers. */
export function publish(evt: ActivityEvent): void {
  if (shouldCoalesce(evt)) return;
  bus.emitter.emit(CHANNEL, evt);
}

/**
 * Subscribe to activity events. Returns an `unsubscribe` function.
 * The filter is applied before invoking the listener.
 */
export function subscribe(
  filter: ActivityFilter,
  listener: (evt: ActivityEvent) => void
): () => void {
  const wrapped = (evt: ActivityEvent) => {
    if (filter.projectIds && filter.projectIds !== '*') {
      // Allow null projectId only when the user is admin (filter === '*')
      if (!evt.projectId || !filter.projectIds.includes(evt.projectId)) return;
    }
    try {
      listener(evt);
    } catch (err) {
      // Never let a bad subscriber kill the bus.
      // eslint-disable-next-line no-console
      console.error('[activityBus] subscriber threw', err);
    }
  };
  bus.emitter.on(CHANNEL, wrapped);
  return () => bus.emitter.off(CHANNEL, wrapped);
}

/** Number of active subscribers (used for cap enforcement). */
export function subscriberCount(): number {
  return bus.emitter.listenerCount(CHANNEL);
}

export interface RecordActivityInput {
  projectId?: string | null;
  featureId?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  type: ActivityEventType;
  message: string;
}

/**
 * Persist an Activity row AND publish it to live subscribers.
 * Replaces direct `prisma.activity.create` calls.
 */
export async function recordActivity(input: RecordActivityInput): Promise<Activity> {
  const row = await prisma.activity.create({
    data: {
      projectId: input.projectId ?? null,
      featureId: input.featureId ?? null,
      actorId: input.actorId ?? null,
      type: input.type,
      message: input.message,
    },
  });
  publish({
    id: row.id,
    type: row.type as ActivityEventType,
    message: row.message,
    projectId: row.projectId,
    featureId: row.featureId,
    actorId: row.actorId,
    actorName: input.actorName ?? null,
    createdAt: row.createdAt.toISOString(),
  });
  return row;
}
