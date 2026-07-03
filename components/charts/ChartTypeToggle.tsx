'use client';

import { IconChartLine, IconChartArea, IconChartBar } from '@tabler/icons-react';
import type { ChartType } from './TimeChart';

const ICON: Record<ChartType, typeof IconChartLine> = {
  line: IconChartLine,
  area: IconChartArea,
  bar: IconChartBar,
};

export function ChartTypeToggle({
  value,
  onChange,
  options,
}: {
  value: ChartType;
  onChange: (t: ChartType) => void;
  options: ChartType[];
}) {
  return (
    <div className="flex gap-0.5 rounded-lg border bg-bg-card p-0.5">
      {options.map((o) => {
        const Icon = ICON[o];
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            title={`${o[0].toUpperCase()}${o.slice(1)} chart`}
            aria-pressed={value === o}
            className={`grid h-7 w-7 place-items-center rounded-md transition-colors ${
              value === o ? 'bg-bg-surface text-text-primary' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Icon size={15} />
          </button>
        );
      })}
    </div>
  );
}
