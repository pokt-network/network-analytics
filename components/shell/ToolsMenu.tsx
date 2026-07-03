'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { IconChevronDown, IconWallet } from '@tabler/icons-react';

// "Tools" nav dropdown. Owner Staking lives here (its own view), not as a peer dashboard tab.
export function ToolsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-lg px-[13px] py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-card hover:text-text-primary"
      >
        Tools
        <IconChevronDown size={15} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-30 min-w-[190px] rounded-[11px] border border-line-hover bg-bg-card p-1.5 shadow-[0_12px_30px_rgba(0,0,0,.3)]"
        >
          <Link
            href="/owner-staking"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-[9px] rounded-lg px-[11px] py-[9px] text-sm text-text-secondary no-underline transition-colors hover:bg-bg-card-hover hover:text-text-primary"
          >
            <IconWallet size={17} />
            Owner Staking
          </Link>
        </div>
      )}
    </div>
  );
}
