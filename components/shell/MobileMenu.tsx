'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { IconMenu2, IconX, IconWallet, IconExternalLink, IconSun, IconMoon } from '@tabler/icons-react';
import { EXPLORER_BASE_URL } from '@/lib/app-config';
import { TABS } from '@/components/dashboard/tabs';

// Phone-only nav (< sm). The AppBar collapses its whole nav into this single control: the theme
// toggle, the five dashboard views, Owner Staking, and the Explorer link all live inside. View
// switches drive the URL and dispatch `popstate`, which the Dashboard already listens to — so it
// stays a client-side switch with no page reload (and works cross-page from /owner-staking).
export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Live theme, mirroring ThemeToggle's external-store read of the <html data-theme> attribute.
  const theme = useSyncExternalStore<'dark' | 'light' | null>(
    useCallback((cb) => {
      window.addEventListener('themechange', cb);
      window.addEventListener('storage', cb);
      return () => {
        window.removeEventListener('themechange', cb);
        window.removeEventListener('storage', cb);
      };
    }, []),
    () => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'),
    () => null,
  );

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('theme', next);
    } catch {}
    window.dispatchEvent(new Event('themechange'));
  }

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function openMenu() {
    // Highlight the current view (home page only — elsewhere no dashboard tab is active).
    setActive(pathname === '/' ? new URLSearchParams(window.location.search).get('tab') || 'traffic' : null);
    setOpen(true);
  }

  function pickTab(key: string) {
    setOpen(false);
    if (pathname === '/') {
      // Mirror Dashboard.writeUrl: swap `tab`, keep `range`, drop `service` off non-Services tabs.
      const params = new URLSearchParams(window.location.search);
      params.set('tab', key);
      if (key !== 'services') params.delete('service');
      window.history.pushState(null, '', `/?${params.toString()}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
      setActive(key);
    } else {
      router.push(`/?tab=${key}`);
    }
  }

  const item = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm no-underline transition-colors';

  return (
    <div ref={ref} className="relative sm:hidden">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu"
        className="grid h-[38px] w-[38px] place-items-center rounded-[9px] border bg-bg-card text-text-secondary transition-colors hover:border-line-hover hover:text-text-primary"
      >
        {open ? <IconX size={19} /> : <IconMenu2 size={19} />}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[228px] rounded-[12px] border border-line-hover bg-bg-card p-2 shadow-[0_16px_40px_rgba(0,0,0,.35)]"
        >
          <button type="button" role="menuitem" onClick={toggleTheme} className={`${item} text-text-secondary hover:bg-bg-card-hover hover:text-text-primary`}>
            {theme === 'light' ? <IconMoon size={18} /> : <IconSun size={18} />}
            {theme === 'light' ? 'Dark mode' : 'Light mode'}
          </button>

          <div className="my-1.5 border-t" />

          {TABS.map((t) => {
            const on = active === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="menuitem"
                aria-current={on ? 'page' : undefined}
                onClick={() => pickTab(t.key)}
                className={`${item} hover:bg-bg-card-hover ${on ? 'font-medium text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
              >
                {t.icon}
                {t.label}
                {on && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue" />}
              </button>
            );
          })}

          <div className="my-1.5 border-t" />

          <Link href="/owner-staking" role="menuitem" onClick={() => setOpen(false)} className={`${item} text-text-secondary hover:bg-bg-card-hover hover:text-text-primary`}>
            <IconWallet size={18} />
            Owner Staking
          </Link>
          <a href={EXPLORER_BASE_URL} target="_blank" rel="noopener noreferrer" role="menuitem" onClick={() => setOpen(false)} className={`${item} text-text-secondary hover:bg-bg-card-hover hover:text-text-primary`}>
            <IconExternalLink size={18} />
            Explorer
          </a>
        </div>
      )}
    </div>
  );
}
