'use client';

import { useCallback, useSyncExternalStore } from 'react';

const Sun = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);
const Moon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

// The active theme is external state (the `data-theme` attr the no-flash script set on <html>).
// Server snapshot is null → render nothing (no hydration mismatch); client reads the live attribute.
export function ThemeToggle() {
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener('themechange', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('themechange', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);
  const theme = useSyncExternalStore<'dark' | 'light' | null>(
    subscribe,
    () => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'),
    () => null,
  );

  function toggle() {
    const next = theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('theme', next);
    } catch {}
    window.dispatchEvent(new Event('themechange'));
  }

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      title="Toggle theme"
      onClick={toggle}
      className="grid h-[38px] w-[38px] place-items-center rounded-[9px] border bg-bg-card text-text-secondary transition-colors hover:border-line-hover hover:text-text-primary"
    >
      {theme === null ? null : theme === 'light' ? Moon : Sun}
    </button>
  );
}
