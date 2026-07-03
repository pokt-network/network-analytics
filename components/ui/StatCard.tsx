import type { ReactNode } from 'react';

export type Trend = 'up' | 'down' | 'flat';

export interface StatCardProps {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  subTrend?: Trend;
  icon?: ReactNode;
  /** One of the ic-* accent colors (var(--blue-soft) etc.). */
  iconColor?: string;
  loading?: boolean;
}

export function StatCard({ label, value, unit, sub, subTrend, icon, iconColor, loading }: StatCardProps) {
  const trendClass =
    subTrend === 'up' ? 'text-mint' : subTrend === 'down' ? 'text-coral' : 'text-text-secondary';
  return (
    <div className="rounded-card border bg-bg-card px-[19px] py-[17px] transition-colors hover:border-line-hover">
      <div className="mb-[9px] flex items-center gap-[7px] text-[12px] uppercase tracking-[0.5px] text-text-secondary">
        {icon && <span style={{ color: iconColor }}>{icon}</span>}
        {label}
      </div>
      {loading ? (
        <span className="skel h-[25px] w-24" />
      ) : (
        <div className="text-[25px] font-semibold tracking-[-0.5px] tabular-nums">
          {value}
          {unit && <small className="ml-1 text-[13px] font-normal text-text-secondary">{unit}</small>}
        </div>
      )}
      {sub && <div className={`mt-1 text-[12px] ${trendClass}`}>{sub}</div>}
    </div>
  );
}
