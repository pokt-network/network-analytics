'use client';

import { fmtNum, fmtDateFull } from '@/lib/chart-format';

// Module-level tooltip (so it isn't re-created each render). Recharts injects active/payload/label;
// formatting is passed via props. `fmtByKey` overrides `yFmt` per series (dual-axis).
export interface SeriesTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: Array<{
    dataKey?: string | number;
    name?: string;
    value?: number;
    color?: string;
    payload?: Record<string, unknown>;
  }>;
  yFmt?: (n: number) => string;
  labelFmt?: (l: string) => string;
  fmtByKey?: Record<string, (n: number) => string>;
  valueSuffix?: string;
}

// One display row: the confirmed value, plus the projected total when this is the current
// (incomplete) bucket. See TimeChart for how the projection fields are attached.
interface Row {
  key: string;
  name: string;
  color?: string;
  soFar: number;
  projTotal: number | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function SeriesTooltip({ active, payload, label, yFmt = fmtNum, labelFmt = fmtDateFull, fmtByKey, valueSuffix = '' }: SeriesTooltipProps) {
  if (!active || !payload?.length) return null;
  const datum = payload[0]?.payload ?? {};

  // Confirmed series first (bars and complete-bucket points). On the current bucket in line/area
  // mode the confirmed value is blanked, so fall back to the dashed `__proj` entries and recover the
  // confirmed-so-far / projected totals from the datum.
  const primary = payload.filter((p) => p.value != null && !String(p.dataKey).endsWith('__proj') && !String(p.dataKey).endsWith('__projRem'));

  let rows: Row[];
  if (primary.length) {
    rows = primary.map((p) => ({
      key: String(p.dataKey),
      name: String(p.name ?? ''),
      color: p.color,
      // Prefer the exact confirmed-so-far from the datum — on the current day the plotted line height
      // is the projection *trajectory*, not the real confirmed value.
      soFar: num(datum[`${p.dataKey}__soFar`]) ?? Number(p.value),
      projTotal: num(datum[`${p.dataKey}__projTotal`]),
    }));
  } else {
    rows = payload
      .filter((p) => p.value != null && String(p.dataKey).endsWith('__proj'))
      .map((p) => {
        const base = String(p.dataKey).replace(/__proj$/, '');
        return {
          key: base,
          name: String(p.name ?? '').replace(/ \(projected\)$/, ''),
          color: p.color,
          soFar: num(datum[`${base}__soFar`]) ?? Number(p.value),
          projTotal: num(datum[`${base}__projTotal`]),
        };
      });
  }
  if (!rows.length) return null;

  const anyProjected = rows.some((r) => r.projTotal != null);
  // Current-day projection points carry their own display label (they sit off-tick on a time axis).
  const header = typeof datum.__label === 'string' ? datum.__label : labelFmt(String(label));

  return (
    <div className="rounded-lg border border-line-hover bg-bg-card px-3 py-2 text-[12px] shadow-[0_8px_24px_rgba(0,0,0,.3)]">
      <div className="mb-1 font-medium text-text-secondary">
        {header}
        {anyProjected && <span className="ml-1 text-text-tertiary">· projected</span>}
      </div>
      {rows.map((r) => {
        const fmt = fmtByKey?.[r.key] ?? yFmt;
        return (
          <div key={r.key}>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-sm" style={{ background: r.color }} />
              <span className="text-text-secondary">
                {r.name}
                {r.projTotal != null && <span className="text-text-tertiary"> · so far</span>}
              </span>
              <span className="ml-auto font-medium tabular-nums text-text-primary">
                {fmt(r.soFar)}
                {valueSuffix}
              </span>
            </div>
            {r.projTotal != null && (
              <div className="flex items-center gap-2 opacity-70">
                <span className="h-2 w-2 rounded-sm border border-dashed" style={{ borderColor: r.color, background: 'transparent' }} />
                <span className="text-text-secondary">{r.name} · projected</span>
                <span className="ml-auto font-medium tabular-nums text-text-primary">
                  {fmt(r.projTotal)}
                  {valueSuffix}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
