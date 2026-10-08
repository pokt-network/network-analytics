'use client';

import type { ReactNode } from 'react';
import { IconUsers } from '@tabler/icons-react';
import { EXPLORER_BASE_URL } from '@/lib/app-config';
import type { SupplierListPage } from '@/lib/data/suppliers-list';
import { Card, CardHeader } from '@/components/ui/Card';
import { ChartSkeleton, EmptyState } from '@/components/ui/states';
import { formatNumber, formatCompact, truncate } from '@/lib/format';

const STATUS_COLOR: Record<string, string> = {
  Staked: 'text-mint',
  Unstaking: 'text-gold',
  Unstaked: 'text-coral',
};

// Shared suppliers table (Operator tool + Owner tool). Presentational: the parent fetches the page
// and owns the page cursor; `right` holds the header controls (a status filter for the Owner tool).
export function SuppliersTable({
  data,
  page,
  onPageChange,
  pageSize = 25,
  right,
  emptyLabel = 'No suppliers found.',
}: {
  data: SupplierListPage | null;
  page: number;
  onPageChange: (p: number) => void;
  pageSize?: number;
  right?: ReactNode;
  emptyLabel?: string;
}) {
  const totalCount = data?.totalCount ?? 0;
  const pages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <Card>
      <CardHeader title="Suppliers" icon={<IconUsers size={18} />} right={right} />
      {!data ? (
        <ChartSkeleton height={200} />
      ) : totalCount === 0 ? (
        <EmptyState>{emptyLabel}</EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  {['Operator', 'Owner', 'Status', 'Stake', 'Services'].map((h, i) => {
                    const hideOnMobile = i === 1;
                    return (
                      <th key={h} className={`border-b px-1.5 pb-[11px] text-[11px] font-medium uppercase tracking-[0.5px] text-text-secondary sm:px-3 ${i >= 3 ? 'text-right' : 'text-left'} ${hideOnMobile ? 'hidden sm:table-cell' : ''}`}>
                        {h}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.operator} className="hover:bg-bg-card-hover">
                    <td className="border-b px-1.5 py-3 font-mono sm:px-3" title={r.operator}>
                      <a href={`${EXPLORER_BASE_URL}/account/${r.operator}`} target="_blank" rel="noopener noreferrer" className="text-text-secondary hover:text-blue-soft">
                        {truncate(r.operator, 8, 4)}
                      </a>
                    </td>
                    <td className="hidden border-b px-1.5 py-3 font-mono text-text-secondary sm:table-cell sm:px-3" title={r.owner}>
                      <a href={`${EXPLORER_BASE_URL}/account/${r.owner}`} target="_blank" rel="noopener noreferrer" className="hover:text-blue-soft">
                        {truncate(r.owner, 8, 4)}
                      </a>
                    </td>
                    <td className={`border-b px-1.5 py-3 sm:px-3 ${STATUS_COLOR[r.status] ?? 'text-text-secondary'}`}>{r.status}</td>
                    <td className="border-b px-1.5 py-3 text-right tabular-nums sm:px-3">{formatCompact(r.stakePokt)}</td>
                    <td className="border-b px-1.5 py-3 text-right tabular-nums sm:px-3">{formatNumber(r.services)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3.5 flex items-center justify-between gap-3 text-[13px] text-text-secondary">
            <span>{formatNumber(totalCount)} suppliers · page {page} of {formatNumber(pages)}</span>
            <div className="flex gap-1.5">
              <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="rounded-lg border bg-bg-card px-3 py-1.5 disabled:opacity-40 hover:enabled:border-line-hover">Prev</button>
              <button type="button" disabled={page >= pages} onClick={() => onPageChange(page + 1)} className="rounded-lg border bg-bg-card px-3 py-1.5 disabled:opacity-40 hover:enabled:border-line-hover">Next</button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
