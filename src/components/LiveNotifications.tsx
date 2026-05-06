'use client';

import { useMemo, useState } from 'react';
import { useActivityStream } from '@/hooks/useActivityStream';
import { ClientTime } from './ClientTime';

export function LiveNotifications() {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(0);
  const { events, connected } = useActivityStream({ bufferSize: 20 });

  const unread = Math.max(0, events.length - seen);
  const visible = useMemo(() => events.slice(0, 8), [events]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) setSeen(events.length);
        }}
        className="btn-ghost relative"
        title={connected ? 'Live notifications connected' : 'Notifications reconnecting'}
      >
        🔔
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex min-w-[18px] justify-center rounded-full bg-red-500 px-1 text-[10px] text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[320px] max-h-[420px] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl z-50 dark:bg-slate-900 dark:border-slate-700">
          <div className="px-3 py-2 border-b flex items-center justify-between dark:border-slate-700">
            <div className="text-sm font-semibold dark:text-slate-100">Live notifications</div>
            <span className={`text-[10px] uppercase ${connected ? 'text-green-600 dark:text-green-400' : 'text-slate-400'}`}>
              {connected ? 'Live' : 'Offline'}
            </span>
          </div>
          <div className="divide-y dark:divide-slate-800">
            {visible.length === 0 && <div className="p-3 text-sm text-slate-500 dark:text-slate-400">No new activity.</div>}
            {visible.map((n) => (
              <div key={n.id} className="p-3 text-sm">
                <div className="text-slate-700 dark:text-slate-200">{n.message}</div>
                <div className="text-xs text-slate-400 mt-1 dark:text-slate-500">
                  {n.actorName ?? 'system'} · <ClientTime iso={n.createdAt} mode="time" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
