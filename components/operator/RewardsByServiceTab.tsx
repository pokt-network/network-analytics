'use client';

import { IconCoin, IconDownload } from '@tabler/icons-react';
import { useStakingTool } from '@/components/staking/StakingToolContext';
import { useTabData } from '@/lib/use-tab-data';
import type { ServiceRewards } from '@/lib/data/operator';
import { notCovered, rangeNote } from '@/lib/data/coverage';
import { Card, CardHeader } from '@/components/ui/Card';
import { ChartSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { formatNumber, formatCompact } from '@/lib/format';
import { toCsv, downloadCsv, csvFilename } from '@/lib/csv';

// Per-service rewards across the operator's rev-share addresses. Gross = claimed settlement; Net =
// what the addresses actually received after rev-share splits (mod-to-account transfers).
export function RewardsByServiceTab() {
  const { addresses, range } = useStakingTool();
  const d = useTabData<ServiceRewards>(
    addresses.length ? `/api/operator/rewards-by-service?addresses=${addresses.join(',')}&range=${range}` : '',
    { prefetchSiblings: false },
  );
  const rows = d.data?.rows ?? [];
  const coverageNote = d.error ? null : rangeNote(d.data?.range ?? null, range === '24h' ? 'hour' : 'day');

  function exportCsv() {
    if (rows.length === 0) return;
    const headers = ['Service', 'Relays', 'Computed Units', 'Gross (POKT)', 'Net (POKT)'];
    const body = rows.map((r) => [r.serviceId, r.relays, r.computedUnits, r.grossPokt, r.netPokt]);
    downloadCsv(csvFilename('operator-rewards-by-service', range), toCsv(headers, body));
  }

  return (
    <Card>
      <CardHeader
        title="Rewards by Service"
        icon={<IconCoin size={18} />}
        right={
          <button
            type="button"
            onClick={exportCsv}
            disabled={rows.length === 0}
            aria-label="Download CSV"
            title={rows.length === 0 ? 'Nothing to download' : 'Download as CSV'}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border bg-bg-card text-text-secondary transition-colors hover:enabled:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconDownload size={15} />
          </button>
        }
      />
      {d.error && !d.data ? (
        <ErrorState>Couldn&apos;t load service rewards for this range.</ErrorState>
      ) : !d.data ? (
        <>
          <ChartSkeleton height={260} />
          <p className="mt-3 text-center text-[12px] text-text-tertiary">
            First load aggregates rewards across your suppliers — this can take a few seconds.
          </p>
        </>
      ) : notCovered(d.data.range) ? (
        <EmptyState>No data indexed for this window.</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState>No service rewards in this window.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {['Service', 'Relays', 'Comp. Units', 'Gross', 'Net'].map((h, i) => (
                  <th key={h} className={`border-b px-1.5 pb-[11px] text-[11px] font-medium uppercase tracking-[0.5px] text-text-secondary sm:px-3 ${i === 0 ? 'text-left' : 'text-right'}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.serviceId} className="hover:bg-bg-card-hover">
                  <td className="border-b px-1.5 py-3 font-medium text-blue-soft sm:px-3">{r.serviceId}</td>
                  <td className="border-b px-1.5 py-3 text-right tabular-nums sm:px-3">{formatNumber(r.relays)}</td>
                  <td className="border-b px-1.5 py-3 text-right tabular-nums sm:px-3">{formatCompact(r.computedUnits)}</td>
                  <td className="border-b px-1.5 py-3 text-right tabular-nums sm:px-3">{formatCompact(r.grossPokt)}</td>
                  <td className="border-b px-1.5 py-3 text-right tabular-nums text-mint sm:px-3">{formatCompact(r.netPokt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {coverageNote && !notCovered(d.data?.range ?? null) && <p className="mt-3 text-[12px] text-text-tertiary">{coverageNote}</p>}
    </Card>
  );
}
