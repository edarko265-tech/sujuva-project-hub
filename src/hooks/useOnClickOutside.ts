'use client';
import { useEffect, useRef } from 'react';

/**
 * Calls `handler` whenever a mousedown / touchstart happens outside the returned ref.
 * Pass `enabled=false` to temporarily disable (e.g. when the dropdown is closed).
 */
export function useOnClickOutside<T extends HTMLElement>(
  enabled: boolean,
  handler: () => void,
) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!enabled) return;
    function onPointer(e: MouseEvent | TouchEvent) {
      const el = ref.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) handler();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handler();
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [enabled, handler]);

  return ref;
}
