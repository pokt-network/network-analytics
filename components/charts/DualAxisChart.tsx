'use client';

import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fmtNum, fmtDateTick } from '@/lib/chart-format';
import { SeriesTooltip } from './SeriesTooltip';

interface AxisSeries {
  key: string;
  color: string;
  label: string;
  fmt?: (n: number) => string;
}

interface Props {
  data: Array<Record<string, number | string>>;
  left: AxisSeries;
  right: AxisSeries;
  interval: 'hour' | 'day' | 'week';
  height?: number;
  xKey?: string;
}

const AXIS = 'var(--text-secondary)';
const GRID = 'var(--border)';

export function DualAxisChart({ data, left, right, interval, height = 240, xKey = 'date' }: Props) {
  const fmtByKey = {
    [left.key]: left.fmt ?? fmtNum,
    [right.key]: right.fmt ?? fmtNum,
  };
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey={xKey}
            tickFormatter={(v) => fmtDateTick(String(v), interval)}
            tick={{ fill: AXIS, fontSize: 11 }}
            stroke={GRID}
            minTickGap={24}
          />
          <YAxis yAxisId="left" tickFormatter={(v) => (left.fmt ?? fmtNum)(Number(v))} tick={{ fill: AXIS, fontSize: 11 }} stroke={GRID} width={48} />
          <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => (right.fmt ?? fmtNum)(Number(v))} tick={{ fill: AXIS, fontSize: 11 }} stroke={GRID} width={48} />
          <Tooltip content={<SeriesTooltip fmtByKey={fmtByKey} />} />
          <Line yAxisId="left" type="monotone" dataKey={left.key} name={left.label} stroke={left.color} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line yAxisId="right" type="monotone" dataKey={right.key} name={right.label} stroke={right.color} strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
