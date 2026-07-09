'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fmtNum, fmtDateTick } from '@/lib/chart-format';
import { SeriesTooltip } from './SeriesTooltip';
import type { SeriesDef } from './TimeSeriesChart';

interface Props {
  data: Array<Record<string, number | string>>;
  series: SeriesDef[];
  interval: 'hour' | 'day' | 'week';
  height?: number;
  xKey?: string;
  yFmt?: (n: number) => string;
  /** Stack the series into bands that sum to a whole (e.g. staked + unstaked = total supply). */
  stacked?: boolean;
  /** Explicit y-axis domain. Fit it to the data range so a small-percentage trend (e.g. supplier
   *  count drifting a few %) reads as real movement instead of a near-flat line on a 0-based axis. */
  yDomain?: [number | string, number | string];
}

const AXIS = 'var(--text-secondary)';
const GRID = 'var(--border)';

export function AreaTimeChart({ data, series, interval, height = 320, xKey = 'date', yFmt = fmtNum, stacked = false, yDomain }: Props) {
  // Stacked bands need a solid fill to read as distinct areas; a single area keeps the soft gradient.
  const [top, bottom] = stacked ? [0.55, 0.28] : [0.22, 0];
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`area-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={top} />
                <stop offset="100%" stopColor={s.color} stopOpacity={bottom} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey={xKey}
            tickFormatter={(v) => fmtDateTick(String(v), interval)}
            tick={{ fill: AXIS, fontSize: 11 }}
            stroke={GRID}
            minTickGap={24}
          />
          <YAxis domain={yDomain} tickFormatter={(v) => yFmt(Number(v))} tick={{ fill: AXIS, fontSize: 11 }} stroke={GRID} width={52} />
          <Tooltip content={<SeriesTooltip yFmt={yFmt} />} />
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stackId={stacked ? 'a' : undefined}
              stroke={s.color}
              strokeWidth={2}
              fill={`url(#area-${s.key})`}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
