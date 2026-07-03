'use client';

import { useEffect, useRef, useState } from 'react';
import { IconAdjustments, IconChevronDown } from '@tabler/icons-react';

export interface MultiOption {
  id: string;
  label: string;
  color: string;
}

// Searchable multi-select (checkbox dropdown) — toggles chart series on/off.
export function MultiSelect({
  options,
  selected,
  onToggle,
  buttonLabel,
}: {
  options: MultiOption[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  buttonLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const q = query.trim().toLowerCase();
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q) || o.id.toLowerCase().includes(q)) : options;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border bg-bg-surface px-3 py-[7px] text-[13px] font-medium text-text-primary transition-colors hover:border-line-hover"
      >
        <IconAdjustments size={15} />
        {buttonLabel ?? `Services (${selected.size})`}
        <IconChevronDown size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-20 w-[240px] rounded-[11px] border border-line-hover bg-bg-card p-2 shadow-[0_12px_30px_rgba(0,0,0,.3)]">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter services…"
            className="mb-1.5 h-[34px] w-full rounded-md border bg-bg-surface px-2.5 text-[13px] text-text-primary outline-none focus:border-blue"
          />
          <div className="scroll-thin max-h-[230px] overflow-y-auto">
            {shown.map((o) => (
              <label
                key={o.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-[7px] text-[13px] hover:bg-bg-card-hover"
              >
                <input
                  type="checkbox"
                  checked={selected.has(o.id)}
                  onChange={() => onToggle(o.id)}
                  style={{ accentColor: 'var(--blue)' }}
                />
                <span className="truncate">{o.label}</span>
                <span className="ml-auto h-[9px] w-[9px] rounded-sm" style={{ background: o.color }} />
              </label>
            ))}
            {shown.length === 0 && <div className="px-2 py-3 text-center text-text-tertiary">No matches.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
