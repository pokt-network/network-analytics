'use client';

import type { ReactNode } from 'react';

export interface TabDef {
  key: string;
  label: string;
  icon?: ReactNode;
}

// Simple pill tab bar (horizontally scrollable on phones). State is owned by the parent.
export function Tabs({ tabs, active, onChange }: { tabs: TabDef[]; active: string; onChange: (key: string) => void }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto rounded-[10px] border bg-bg-card p-[3px]">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          aria-pressed={active === t.key}
          className={`flex shrink-0 items-center gap-1.5 rounded-[7px] px-3.5 py-2 text-[13px] font-medium transition-colors ${
            active === t.key ? 'bg-bg-surface text-text-primary' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}
