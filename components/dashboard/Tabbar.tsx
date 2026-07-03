'use client';

import type { ReactNode } from 'react';

export interface TabDef {
  key: string;
  label: string;
  icon?: ReactNode;
  badge?: string;
}

export function Tabbar({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-0.5 border-b" role="tablist">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.key)}
            className={`relative flex items-center gap-2 px-[18px] py-3 text-[15px] font-medium transition-colors ${
              on ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {t.icon}
            {t.label}
            {t.badge && (
              <span className="rounded border px-[5px] py-px text-[10px] font-semibold uppercase tracking-[0.4px] text-lavender">
                {t.badge}
              </span>
            )}
            {on && <span className="absolute inset-x-[14px] -bottom-px h-0.5 rounded bg-blue" />}
          </button>
        );
      })}
    </div>
  );
}
