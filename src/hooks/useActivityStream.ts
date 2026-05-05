'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Wire format mirrored from `src/lib/activityBus.ts#ActivityEvent`.
 * Kept duplicated to avoid pulling server-only modules into client bundles.
 */
export interface StreamedActivity {
  id: string;
  type: 'CREATE' | 'UPDATE' | 'DELETE' | 'COMMENT' | 'STATUS_CHANGE' | 'ASSIGN' | 'NOTE';
  message: string;
  projectId: string | null;
  featureId: string | null;
  actorId: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface UseActivityStreamOptions {
  /** Cap on retained events. Older events are dropped. Default: 50. */
  bufferSize?: number;
  /** Optional callback for every received event (e.g. toasts). */
  onEvent?: (evt: StreamedActivity) => void;
  /** Set false to suspend connection. Default: true. */
  enabled?: boolean;
}

/**
 * Subscribe to the SSE `/api/stream` endpoint.
 *
 * Returns the most recent events (newest first) plus connection state. The
 * browser's `EventSource` handles reconnection automatically using the
 * `retry:` value the server sends.
 */
export function useActivityStream(opts: UseActivityStreamOptions = {}) {
  const { bufferSize = 50, onEvent, enabled = true } = opts;
  const [events, setEvents] = useState<StreamedActivity[]>([]);
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const es = new EventSource('/api/stream');

    const handleHello = () => setConnected(true);
    const handleActivity = (e: MessageEvent) => {
      try {
        const evt = JSON.parse(e.data) as StreamedActivity;
        setEvents((prev) => {
          // De-dupe by id (in case reconnect replays)
          if (prev.some((p) => p.id === evt.id)) return prev;
          const next = [evt, ...prev];
          return next.length > bufferSize ? next.slice(0, bufferSize) : next;
        });
        onEventRef.current?.(evt);
      } catch {
        /* ignore malformed payload */
      }
    };
    const handleError = () => setConnected(false);

    es.addEventListener('hello', handleHello);
    es.addEventListener('activity', handleActivity);
    es.addEventListener('error', handleError);

    return () => {
      es.removeEventListener('hello', handleHello);
      es.removeEventListener('activity', handleActivity);
      es.removeEventListener('error', handleError);
      es.close();
      setConnected(false);
    };
  }, [enabled, bufferSize]);

  return { events, connected };
}
