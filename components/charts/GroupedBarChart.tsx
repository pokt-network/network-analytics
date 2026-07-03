'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fmtNum, fmtDateTick } from '@/lib/chart-format';
import { SeriesTooltip } from './SeriesTooltip';

interface BarDef {
  key: string;
  color: string;
  label: string;
}

interface Props {
  data: Array<Record<string, number | string>>;
  bars: BarDef[];
  interval: 'hour' | 'day' | 'week';
  height?: number;
  xKey?: string;
  yFmt?: (n: number) => string;
}

const AXIS = 'var(--text-secondary)';
const GRID = 'var(--border)';

export function GroupedBarChart({ data, bars, interval, height = 240, xKey = 'date', yFmt = fmtNum }: Props) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey={xKey}
            tickFormatter={(v) => fmtDateTick(String(v), interval)}
            tick={{ fill: AXIS, fontSize: 11 }}
            stroke={GRID}
            minTickGap={16}
          />
          <YAxis tickFormatter={(v) => yFmt(Number(v))} tick={{ fill: AXIS, fontSize: 11 }} stroke={GRID} width={52} />
          <Tooltip content={<SeriesTooltip yFmt={yFmt} />} cursor={{ fill: 'var(--bg-card-hover)' }} />
          {bars.map((b) => (
            <Bar key={b.key} dataKey={b.key} name={b.label} fill={b.color} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
