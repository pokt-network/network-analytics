'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { fmtNum, fmtDateTick } from '@/lib/chart-format';
import { SeriesTooltip } from './SeriesTooltip';

interface Pin {
  date: string; // YYYY-MM-DD
  label: string;
}

interface Props {
  data: Array<{ date: string; totalSupplyPokt: number }>;
  pins: Pin[];
  height?: number;
}

const AXIS = 'var(--text-secondary)';
const GRID = 'var(--border)';

function nearestX(data: Props['data'], pinDate: string): string | null {
  const target = Date.parse(`${pinDate}T00:00:00Z`);
  let best: string | null = null;
  let bd = Infinity;
  for (const d of data) {
    const diff = Math.abs(Date.parse(d.date) - target);
    if (diff < bd) {
      bd = diff;
      best = d.date;
    }
  }
  return best;
}

export function SupplyHistoryChart({ data, pins, height = 320 }: Props) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <defs>
            <linearGradient id="supply-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--blue)" stopOpacity={0.18} />
              <stop offset="100%" stopColor="var(--blue)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(v) => fmtDateTick(String(v), 'day')}
            tick={{ fill: AXIS, fontSize: 11 }}
            stroke={GRID}
            minTickGap={40}
          />
          <YAxis
            domain={[2_000_000_000, 'dataMax']}
            tickFormatter={(v) => fmtNum(Number(v))}
            tick={{ fill: AXIS, fontSize: 11 }}
            stroke={GRID}
            width={52}
          />
          <Tooltip content={<SeriesTooltip yFmt={fmtNum} valueSuffix=" POKT" />} />
          {pins.map((p) => {
            const x = nearestX(data, p.date);
            if (!x) return null;
            return (
              <ReferenceLine
                key={p.date + p.label}
                x={x}
                stroke="var(--gold)"
                strokeDasharray="4 3"
                label={{ value: p.label, position: 'insideTopRight', fill: 'var(--gold)', fontSize: 10 }}
              />
            );
          })}
          <Area
            type="monotone"
            dataKey="totalSupplyPokt"
            name="Total Supply"
            stroke="var(--blue)"
            strokeWidth={2}
            fill="url(#supply-fill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
