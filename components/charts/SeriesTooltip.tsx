'use client';

import { fmtNum, fmtDateFull } from '@/lib/chart-format';

// Module-level tooltip (so it isn't re-created each render). Recharts injects active/payload/label;
// formatting is passed via props. `fmtByKey` overrides `yFmt` per series (dual-axis).
export interface SeriesTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ dataKey?: string | number; name?: string; value?: number; color?: string }>;
  yFmt?: (n: number) => string;
  labelFmt?: (l: string) => string;
  fmtByKey?: Record<string, (n: number) => string>;
  valueSuffix?: string;
}

export function SeriesTooltip({ active, payload, label, yFmt = fmtNum, labelFmt = fmtDateFull, fmtByKey, valueSuffix = '' }: SeriesTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line-hover bg-bg-card px-3 py-2 text-[12px] shadow-[0_8px_24px_rgba(0,0,0,.3)]">
      <div className="mb-1 font-medium text-text-secondary">{labelFmt(String(label))}</div>
      {payload.map((p) => {
        const fmt = fmtByKey?.[String(p.dataKey)] ?? yFmt;
        return (
          <div key={String(p.dataKey)} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
            <span className="text-text-secondary">{p.name}</span>
            <span className="ml-auto font-medium tabular-nums text-text-primary">
              {fmt(Number(p.value))}
              {valueSuffix}
            </span>
          </div>
        );
      })}
    </div>
  );
}
