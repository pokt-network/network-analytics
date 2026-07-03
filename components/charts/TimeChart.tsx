'use client';

import { useState } from 'react';
import { ComposedChart, Line, Area, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fmtNum, fmtDateTick } from '@/lib/chart-format';
import { SeriesTooltip } from './SeriesTooltip';

export type ChartType = 'line' | 'area' | 'bar';

export interface SeriesDef {
  key: string;
  color: string;
  label: string;
}

interface Props {
  data: Array<Record<string, number | string | null>>;
  series: SeriesDef[];
  interval: 'hour' | 'day' | 'week';
  type: ChartType;
  height?: number;
  xKey?: string;
  yFmt?: (n: number) => string;
  /** Project the trailing (partial) bucket to a full-period estimate, drawn dashed. */
  projected?: boolean;
  /** Deterministic "now" for the projection (defaults to Date.now()). */
  nowMs?: number;
}

const AXIS = 'var(--text-secondary)';
const GRID = 'var(--border)';
const BUCKET_MS: Record<'hour' | 'day' | 'week', number> = { hour: 3_600_000, day: 86_400_000, week: 604_800_000 };

// Scale the trailing partial bucket up to a full-period estimate (PoktScan's end-of-day projection):
// the current bucket only covers `elapsed` of its period, so `actual / elapsed` estimates its total.
function project(
  data: Props['data'],
  series: SeriesDef[],
  interval: 'hour' | 'day' | 'week',
  xKey: string,
  nowMs: number,
): { data: Props['data']; on: boolean } {
  if (data.length < 2) return { data, on: false };
  const n = data.length;
  const start = Date.parse(String(data[n - 1][xKey]));
  if (!Number.isFinite(start)) return { data, on: false };
  const elapsed = Math.min(1, Math.max(0.02, (nowMs - start) / BUCKET_MS[interval]));
  if (elapsed >= 0.985) return { data, on: false }; // bucket essentially complete
  const out = data.map((r) => ({ ...r }));
  for (const s of series) {
    const actual = Number(out[n - 1][s.key] ?? 0);
    out[n - 1][`${s.key}__proj`] = actual / elapsed;
    out[n - 2][`${s.key}__proj`] = out[n - 2][s.key]; // anchor the dashed connector to the last full bucket
  }
  return { data: out, on: true };
}

export function TimeChart({ data, series, interval, type, height = 340, xKey = 'date', yFmt = fmtNum, projected = false, nowMs }: Props) {
  // Capture wall-clock once at mount for the projection baseline (this chart only renders
  // client-side after data loads, so there's no SSR/hydration concern).
  const [mountNow] = useState(() => Date.now());
  const now = nowMs ?? mountNow;
  const { data: pdata, on } = projected ? project(data, series, interval, xKey, now) : { data, on: false };
  const n = pdata.length;

  // Line/area: hide the partial actual so the solid line stops at the last full bucket (the dashed
  // projection continues it). Bar: replace the last bar's value with the projection.
  const renderData = !on
    ? pdata
    : pdata.map((r, i) => {
        if (i !== n - 1) return r;
        const patched = { ...r };
        for (const s of series) patched[s.key] = type === 'bar' ? (r[`${s.key}__proj`] ?? null) : null;
        return patched;
      });

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={renderData} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          {type === 'area' && (
            <defs>
              {series.map((s) => (
                <linearGradient key={s.key} id={`tc-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
          )}
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey={xKey}
            tickFormatter={(v) => fmtDateTick(String(v), interval)}
            tick={{ fill: AXIS, fontSize: 11 }}
            stroke={GRID}
            minTickGap={type === 'bar' ? 16 : 24}
          />
          <YAxis tickFormatter={(v) => yFmt(Number(v))} tick={{ fill: AXIS, fontSize: 11 }} stroke={GRID} width={52} />
          <Tooltip content={<SeriesTooltip yFmt={yFmt} />} cursor={type === 'bar' ? { fill: 'var(--bg-card-hover)' } : undefined} />

          {series.map((s) => {
            if (type === 'bar') {
              return (
                <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {on && renderData.map((_, i) => <Cell key={i} fillOpacity={i === n - 1 ? 0.45 : 1} />)}
                </Bar>
              );
            }
            if (type === 'area') {
              return (
                <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} fill={`url(#tc-${s.key})`} dot={false} connectNulls isAnimationActive={false} />
              );
            }
            return (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
            );
          })}

          {/* Dashed projection for line/area modes. */}
          {on &&
            type !== 'bar' &&
            series.map((s) => (
              <Line
                key={`${s.key}__proj`}
                type="monotone"
                dataKey={`${s.key}__proj`}
                name={`${s.label} (projected)`}
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
