import type { ReactNode } from 'react';

export function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`skel ${className}`} />;
}

/** Fills a chart area while data loads. Height matches the chart wrappers. */
export function ChartSkeleton({ height = 320 }: { height?: number }) {
  return (
    <div className="w-full" style={{ height }}>
      <span className="skel block h-full w-full rounded-lg" />
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="px-6 py-10 text-center text-[13.5px] text-text-tertiary">{children}</div>;
}

export function ErrorState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-[rgba(255,90,95,.25)] bg-[rgba(255,90,95,.07)] px-4 py-3 text-[13px] text-coral">
      {children}
    </div>
  );
}
