'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fmtNum, fmtDateTick } from '@/lib/chart-format';
import { SeriesTooltip } from './SeriesTooltip';

export interface SeriesDef {
  key: string;
  color: string;
  label: string;
}

interface Props {
  data: Array<Record<string, number | string | null>>;
  series: SeriesDef[];
  interval: 'hour' | 'day' | 'week';
  height?: number;
  xKey?: string;
  /** Draw lines across null points (default). Off when a null means "no data here", not "no point". */
  connectNulls?: boolean;
}

// SVG stroke/fill accept CSS var() strings and inherit theme changes, so charts re-theme for free.
const AXIS = 'var(--text-secondary)';
const GRID = 'var(--border)';

const isMissing = (v: unknown) => v === null || v === undefined;

/** Without connectNulls a point with no neighbour draws no line; mark it so it does not vanish. */
function isolatedDot(data: Props['data'], key: string, color: string, p: { cx?: number; cy?: number; index?: number }) {
  const i = p.index ?? -1;
  const lone = i >= 0 && !isMissing(data[i]?.[key]) && isMissing(data[i - 1]?.[key]) && isMissing(data[i + 1]?.[key]);
  return lone && p.cx != null && p.cy != null ? <circle key={`${key}-${i}`} cx={p.cx} cy={p.cy} r={2.5} fill={color} /> : <g key={`${key}-${i}`} />;
}

export function TimeSeriesChart({ data, series, interval, height = 340, xKey = 'date', connectNulls = true }: Props) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey={xKey}
            tickFormatter={(v) => fmtDateTick(String(v), interval)}
            tick={{ fill: AXIS, fontSize: 11 }}
            stroke={GRID}
            minTickGap={24}
          />
          <YAxis tickFormatter={(v) => fmtNum(Number(v))} tick={{ fill: AXIS, fontSize: 11 }} stroke={GRID} width={52} />
          <Tooltip content={<SeriesTooltip />} />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={connectNulls ? false : (p: { cx?: number; cy?: number; index?: number }) => isolatedDot(data, s.key, s.color, p)}
              connectNulls={connectNulls}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
