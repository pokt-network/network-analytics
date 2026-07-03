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
  data: Array<Record<string, number | string>>;
  series: SeriesDef[];
  interval: 'hour' | 'day' | 'week';
  height?: number;
  xKey?: string;
}

// SVG stroke/fill accept CSS var() strings and inherit theme changes, so charts re-theme for free.
const AXIS = 'var(--text-secondary)';
const GRID = 'var(--border)';

export function TimeSeriesChart({ data, series, interval, height = 340, xKey = 'date' }: Props) {
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
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
