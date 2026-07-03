'use client';

import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

export interface DonutDatum {
  name: string;
  value: number;
  color: string;
}

// Donut only — the parent renders the labeled legend list (matches the mockup layout).
export function DonutChart({ data, height = 220 }: { data: DonutDatum[]; height?: number }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="62%"
            outerRadius="100%"
            paddingAngle={1}
            stroke="none"
            isAnimationActive={false}
          >
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
