'use client';

import { RANGE_KEYS, type RangeKey } from '@/lib/app-config';

// Global range control for the five dashboard tabs (hidden in the Owner Staking view).
export function RangePills({ value, onChange }: { value: RangeKey; onChange: (r: RangeKey) => void }) {
  return (
    <div className="flex gap-1 rounded-[10px] border bg-bg-card p-1 sm:p-[3px]">
      {RANGE_KEYS.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          aria-pressed={value === k}
          className={`rounded-[7px] px-[18px] py-2.5 text-sm font-medium transition-colors sm:px-[13px] sm:py-[7px] sm:text-[13px] ${
            value === k ? 'bg-bg-surface text-text-primary' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          {k}
        </button>
      ))}
    </div>
  );
}
