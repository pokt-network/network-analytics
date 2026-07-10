'use client';

import { useState } from 'react';
import { ComposedChart, Line, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fmtNum, fmtDateTick, fmtDateFull } from '@/lib/chart-format';
import { SeriesTooltip } from './SeriesTooltip';

export type ChartType = 'line' | 'area' | 'bar';

export interface SeriesDef {
  key: string;
  color: string;
  label: string;
}

type Row = Record<string, number | string | null>;

interface Props {
  data: Row[];
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
  /** Explicit y-axis domain — fit it to the data range so a small-percentage trend reads as real
   *  movement instead of a near-flat line. Ignored for bars, which must keep a 0-based baseline. */
  yDomain?: [number | string, number | string];
}

const AXIS = 'var(--text-secondary)';
const GRID = 'var(--border)';
const BUCKET_MS: Record<'hour' | 'day' | 'week', number> = { hour: 3_600_000, day: 86_400_000, week: 604_800_000 };

// End-of-period projection (PoktScan-style): the current bucket only covers `elapsed` of its period,
// so `actual / elapsed` estimates its full-period total. `elapsed` is the fraction of the current
// bucket that has passed; `false` means "don't project".
//
interface BucketState {
  elapsed: number;
  /** Project this bucket (daily/weekly, meaningfully underway but not complete). */
  project: boolean;
  /** Bucket is barely started — drop it so its ~0 value doesn't crash the line to the floor. */
  drop: boolean;
}

// Decides how to treat the trailing (current) bucket:
//  • DROP if barely started (< 10% elapsed) — e.g. the first UTC hours of a new day. Its value is
//    ~0, so plotting it raw crashes the line; projecting it (soFar / tiny elapsed) explodes. Just end
//    the chart at the last complete bucket instead.
//  • PROJECT if a daily/weekly bucket is meaningfully underway (10–98.5%). A single partial hour is
//    never projected — CU settles in bursts, so soFar/elapsed is unstable at hourly granularity.
//  • otherwise show as-is (a complete bucket, or an hourly bucket past its first sliver).
function currentBucket(data: Row[], interval: 'hour' | 'day' | 'week', xKey: string, nowMs: number): BucketState | null {
  if (data.length < 2) return null;
  const start = Date.parse(String(data[data.length - 1][xKey]));
  if (!Number.isFinite(start)) return null;
  const elapsed = (nowMs - start) / BUCKET_MS[interval];
  const drop = elapsed < 0.1;
  const project = !drop && elapsed < 0.985 && interval !== 'hour';
  return { elapsed, project, drop };
}

// Bars: keep the current bucket's confirmed value as the solid base and stack a translucent
// "remainder" (projected − confirmed) on top. Stays on the category axis.
function projectBar(data: Row[], series: SeriesDef[], elapsed: number): Row[] {
  const out = data.map((r) => ({ ...r }));
  const today = out[out.length - 1];
  for (const s of series) {
    const actual = Number(today[s.key] ?? 0);
    const projTotal = actual / elapsed;
    today[`${s.key}__soFar`] = actual;
    today[`${s.key}__projTotal`] = projTotal;
    today[`${s.key}__projRem`] = Math.max(0, projTotal - actual);
  }
  return out;
}

// Line/area: the current (incomplete) day occupies the final segment. Rather than plotting the raw
// confirmed-so-far value — a partial cumulative that dips below the full days and then spikes up to
// the projection — the line traces one smooth trajectory from the last complete day up to the
// projected full-day total. The solid/dashed split marks elapsed-vs-remaining time along that same
// trajectory (so the hard line flows naturally into the projection instead of kinking). The exact
// confirmed-so-far and projected totals still surface in the tooltip. A numeric time axis lets the
// split sit off-tick at the elapsed position; the projected total lands on the current-day tick.
function projectLine(
  data: Row[],
  series: SeriesDef[],
  xKey: string,
  elapsed: number,
): { data: Row[]; ticks: number[] } {
  const rows: Row[] = data.map((r) => ({ ...r, __t: Date.parse(String(r[xKey])) }));
  const ticks = rows.map((r) => Number(r.__t)); // day-boundary ticks, incl. the current day
  const n = rows.length;
  const last = rows[n - 1];
  const lastT = Number(last.__t);
  const prevT = Number(rows[n - 2].__t);
  const splitT = prevT + elapsed * (lastT - prevT); // where confirmed time ends within the final segment
  const dayLabel = fmtDateFull(new Date(lastT).toISOString()); // both current-day points read as the current day

  const split: Row = { __t: splitT, __label: dayLabel };
  const projected: Row = { __t: lastT, __label: dayLabel };
  for (const s of series) {
    const actual = Number(last[s.key] ?? 0); // real confirmed-so-far (tooltip only)
    const projTotal = actual / elapsed;
    const prevVal = Number(rows[n - 2][s.key] ?? 0);
    const splitVal = prevVal + elapsed * (projTotal - prevVal); // on the last-complete → projected line
    // Split point: solid endpoint + dashed start, sitting on the smooth trajectory.
    split[s.key] = splitVal;
    split[`${s.key}__proj`] = splitVal;
    split[`${s.key}__soFar`] = actual;
    split[`${s.key}__projTotal`] = projTotal;
    // Projected point (on the tick): no solid, dashed end.
    projected[s.key] = null;
    projected[`${s.key}__proj`] = projTotal;
    projected[`${s.key}__soFar`] = actual;
    projected[`${s.key}__projTotal`] = projTotal;
  }
  return { data: [...rows.slice(0, n - 1), split, projected], ticks };
}

export function TimeChart({ data, series, interval, type, height = 340, xKey = 'date', yFmt = fmtNum, projected = false, nowMs, yDomain }: Props) {
  // Capture wall-clock once at mount for the projection baseline (this chart only renders
  // client-side after data loads, so there's no SSR/hydration concern).
  const [mountNow] = useState(() => Date.now());
  const now = nowMs ?? mountNow;
  const bucket = projected ? currentBucket(data, interval, xKey, now) : null;
  const on = bucket?.project ?? false;
  const isBar = type === 'bar';
  // Numeric time axis only for the projected line/area case (so the confirmed point can sit off-tick);
  // everything else keeps the simpler category axis.
  const numeric = on && !isBar;
  // Drop a barely-started trailing bucket (unless we're projecting it) so its ~0 value isn't plotted.
  const baseData = bucket?.drop ? data.slice(0, -1) : data;

  let renderData: Row[];
  let ticks: number[] | undefined;
  if (isBar) {
    renderData = on ? projectBar(data, series, bucket!.elapsed) : baseData;
  } else if (numeric) {
    const pl = projectLine(data, series, xKey, bucket!.elapsed);
    renderData = pl.data;
    ticks = pl.ticks;
  } else {
    renderData = baseData;
  }

  const xAxisKey = numeric ? '__t' : xKey;
  const labelFmt = numeric ? (v: string) => fmtDateFull(new Date(Number(v)).toISOString()) : fmtDateFull;

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
            dataKey={xAxisKey}
            type={numeric ? 'number' : 'category'}
            domain={numeric && ticks ? [ticks[0], ticks[ticks.length - 1]] : undefined}
            ticks={numeric ? ticks : undefined}
            tickFormatter={(v) => fmtDateTick(numeric ? new Date(Number(v)).toISOString() : String(v), interval)}
            tick={{ fill: AXIS, fontSize: 11 }}
            stroke={GRID}
            minTickGap={type === 'bar' ? 16 : 24}
          />
          <YAxis domain={isBar ? undefined : yDomain} tickFormatter={(v) => yFmt(Number(v))} tick={{ fill: AXIS, fontSize: 11 }} stroke={GRID} width={52} />
          <Tooltip content={<SeriesTooltip yFmt={yFmt} labelFmt={labelFmt} />} cursor={type === 'bar' ? { fill: 'var(--bg-card-hover)' } : undefined} />

          {/* Confirmed series. Bars additionally stack a translucent "remainder" for the current
              bucket; line/area continue with a dashed projection segment (rendered below). */}
          {type === 'bar'
            ? series.flatMap((s) => {
                const bars = [
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    fill={s.color}
                    stackId={on ? s.key : undefined}
                    radius={[3, 3, 0, 0]}
                    isAnimationActive={false}
                  />,
                ];
                if (on) {
                  bars.push(
                    <Bar
                      key={`${s.key}__projRem`}
                      dataKey={`${s.key}__projRem`}
                      name={`${s.label} (projected)`}
                      fill={s.color}
                      fillOpacity={0.4}
                      stackId={s.key}
                      radius={[3, 3, 0, 0]}
                      isAnimationActive={false}
                    />,
                  );
                }
                return bars;
              })
            : series.map((s) =>
                type === 'area' ? (
                  <Area
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stroke={s.color}
                    strokeWidth={2}
                    fill={`url(#tc-${s.key})`}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                ) : (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stroke={s.color}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                ),
              )}

          {/* Dashed projection tail for line/area: confirmed value → projected full-period total. */}
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
