'use client';

import { useMemo } from 'react';
import { useActivityStream, type StreamedActivity } from '@/hooks/useActivityStream';
import { ClientTime } from './ClientTime';

export interface InitialActivity {
  id: string;
  message: string;
  createdAt: string; // ISO
  actorName: string | null;
}

/**
 * Client wrapper around the dashboard "Recent activity" card.
 *
 * Receives the server-rendered `initial` list (so the page is meaningful with
 * JS off / before SSE connects), then merges in live events from `/api/stream`.
 */
export function RecentActivityFeed({ initial, max = 8 }: { initial: InitialActivity[]; max?: number }) {
  const { events, connected } = useActivityStream({ bufferSize: max });

  const merged = useMemo(() => {
    const fromStream: InitialActivity[] = events.map((e: StreamedActivity) => ({
      id: e.id,
      message: e.message,
      createdAt: e.createdAt,
      actorName: e.actorName,
    }));
    const seen = new Set<string>();
    const all: InitialActivity[] = [];
    for (const item of [...fromStream, ...initial]) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      all.push(item);
    }
    return all.slice(0, max);
  }, [events, initial, max]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Recent activity</h2>
        <span
          className={`inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider ${
            connected ? 'text-green-600' : 'text-slate-400'
          }`}
          title={connected ? 'Live updates active' : 'Reconnecting…'}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`}
          />
          {connected ? 'Live' : 'Offline'}
        </span>
      </div>
      <div className="card divide-y">
        {merged.length === 0 && <div className="p-4 text-sm text-slate-500">Nothing yet.</div>}
        {merged.map((a) => (
          <div key={a.id} className="p-3 text-sm">
            <div className="text-slate-700">{a.message}</div>
            <div className="text-xs text-slate-400 mt-0.5">
              {a.actorName ?? 'system'} · <ClientTime iso={a.createdAt} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
