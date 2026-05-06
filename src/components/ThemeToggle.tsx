'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

function getInitial(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

/**
 * Light/dark theme toggle. The active theme is mirrored on <html class="dark">
 * and persisted in localStorage. Initial value is set by the inline bootstrap
 * script in the root layout so there's no flash on first paint.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(getInitial());
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* storage may be disabled */
    }
  }

  // Render a stable placeholder until mounted to avoid hydration mismatch.
  if (!mounted) {
    return <button type="button" className="btn-ghost" aria-label="Toggle theme" suppressHydrationWarning>🌓</button>;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn-ghost"
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
