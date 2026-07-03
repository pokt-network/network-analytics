'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fmtNum } from '@/lib/chart-format';
import { SeriesTooltip } from './SeriesTooltip';

interface ProjPoint {
  label: string;
  low: number;
  current: number;
  high: number;
}

const AXIS = 'var(--text-secondary)';
const GRID = 'var(--border)';
const idLabel = (l: string) => l;

export function ProjectionChart({ data, height = 240 }: { data: ProjPoint[]; height?: number }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 11 }} stroke={GRID} />
          <YAxis
            domain={[1_000_000_000, 'dataMax']}
            tickFormatter={(v) => fmtNum(Number(v))}
            tick={{ fill: AXIS, fontSize: 11 }}
            stroke={GRID}
            width={52}
          />
          <Tooltip content={<SeriesTooltip labelFmt={idLabel} />} />
          <Line type="monotone" dataKey="low" name="Low demand" stroke="var(--coral)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="current" name="Current demand" stroke="var(--blue)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="high" name="High demand" stroke="var(--mint)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
