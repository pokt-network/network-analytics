'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { IconSearch } from '@tabler/icons-react';

export interface ServiceItem {
  id: string;
  name: string;
}

// Searchable type-ahead over service id + label (100+ services — a picker, not a chip row).
export function ServicePicker({
  onSelect,
  selectedLabel,
  items: preloaded,
}: {
  onSelect: (s: ServiceItem) => void;
  selectedLabel?: string;
  items?: ServiceItem[];
}) {
  const [fetched, setFetched] = useState<ServiceItem[]>([]);
  const items = preloaded ?? fetched;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (preloaded) return;
    fetch('/api/services/list')
      .then((r) => r.json())
      .then((d) => setFetched(d.services ?? []))
      .catch(() => {});
  }, [preloaded]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () => (q ? items.filter((i) => i.id.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)) : items).slice(0, 50),
    [items, q],
  );

  return (
    <div ref={ref} className="relative max-w-[420px]">
      <IconSearch size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary" />
      <input
        value={open ? query : (selectedLabel ?? query)}
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        placeholder="Search by service ID or name — e.g. bsc, Ethereum, sol…"
        className="h-11 w-full rounded-[10px] border bg-bg-surface pl-10 pr-3.5 text-[15px] text-text-primary outline-none focus:border-blue"
      />
      {open && (
        <div className="scroll-thin absolute inset-x-0 top-[calc(100%+6px)] z-20 max-h-[260px] overflow-y-auto rounded-[11px] border border-line-hover bg-bg-card p-1.5 shadow-[0_12px_30px_rgba(0,0,0,.3)]">
          {shown.map((i) => (
            <div
              key={i.id}
              onClick={() => {
                onSelect(i);
                setOpen(false);
                setQuery('');
              }}
              className="flex cursor-pointer items-center justify-between gap-2.5 rounded-lg px-[11px] py-[9px] text-sm hover:bg-bg-card-hover"
            >
              <span className="font-medium text-blue-soft">{i.id}</span>
              <span className="text-[12px] text-text-secondary">{i.name}</span>
            </div>
          ))}
          {shown.length === 0 && <div className="px-3 py-3 text-center text-text-tertiary">No services match.</div>}
        </div>
      )}
    </div>
  );
}
