'use client';

import { useEffect, useState } from 'react';

/**
 * Renders a locale-formatted timestamp only after mount to avoid SSR/CSR
 * hydration mismatches caused by server vs browser locale/timezone differences.
 *
 * The ISO string is rendered server-side as a stable fallback (visible to
 * crawlers and JS-disabled users); after hydration it is replaced.
 */
export function ClientTime({
  iso,
  mode = 'datetime',
}: {
  iso: string;
  mode?: 'datetime' | 'time';
}) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return;
    setText(mode === 'time' ? d.toLocaleTimeString() : d.toLocaleString());
  }, [iso, mode]);

  return (
    <time dateTime={iso} suppressHydrationWarning>
      {text ?? iso.replace('T', ' ').replace(/\..+$/, '')}
    </time>
  );
}
