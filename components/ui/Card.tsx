import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-card border bg-bg-card p-5 transition-colors hover:border-line-hover ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  icon,
  tag,
  right,
}: {
  title: ReactNode;
  icon?: ReactNode;
  tag?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
      <div className="flex items-center gap-2 text-base font-semibold">
        {icon && <span className="text-text-secondary">{icon}</span>}
        {title}
      </div>
      {right ?? (tag && <CardTag>{tag}</CardTag>)}
    </div>
  );
}

export function CardTag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md border px-2 py-0.5 text-[11px] text-text-secondary">{children}</span>
  );
}
