'use client';

import { IconChartBar } from '@tabler/icons-react';
import { useStakingTool } from '@/components/staking/StakingToolContext';
import { useTabData } from '@/lib/use-tab-data';
import type { ClaimProofs } from '@/lib/data/operator';
import { notCovered, rangeNote } from '@/lib/data/coverage';
import { Card, CardHeader } from '@/components/ui/Card';
import { GroupedBarChart } from '@/components/charts/GroupedBarChart';
import { ChartSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { formatNumber } from '@/lib/format';

const BARS = [
  { key: 'claims', color: '#4c9bf5', label: 'Claims' },
  { key: 'proofs', color: '#48e5c2', label: 'Proofs' },
  { key: 'expired', color: '#ff5a5f', label: 'Expired' },
];

// Claims the chain closed per bucket, for the suppliers that share revenue with the operator's addresses now (settlement
// catalog). "Proofs" counts the settled ones, "Expired" the ones that expired (proof missing/invalid), "Claims" every
// one closed (settled, expired or discarded), all by the block that closed them.
export function ClaimProofTab() {
  const { addresses, range } = useStakingTool();
  const d = useTabData<ClaimProofs>(
    addresses.length ? `/api/operator/claim-proof?addresses=${addresses.join(',')}&range=${range}` : '',
    { prefetchSiblings: false },
  );
  const coverageNote = d.error ? null : rangeNote(d.data?.range ?? null, range === '24h' ? 'hour' : 'day');

  return (
    <Card>
      <CardHeader title="Claims / Proofs / Expired" icon={<IconChartBar size={18} />} right={<span className="text-[12px] text-text-tertiary">claims closed</span>} />
      {d.error && !d.data ? (
        <ErrorState>Couldn&apos;t load claim activity for this range.</ErrorState>
      ) : !d.data ? (
        <ChartSkeleton height={300} />
      ) : notCovered(d.data.range) ? (
        <EmptyState>No data indexed for this window.</EmptyState>
      ) : d.data.points.length === 0 ? (
        <EmptyState>No claim activity in this window.</EmptyState>
      ) : (
        <GroupedBarChart data={d.data.points as unknown as Array<Record<string, number | string>>} bars={BARS} interval={range === '24h' ? 'hour' : 'day'} height={300} yFmt={(n) => formatNumber(n)} />
      )}
      {coverageNote && !notCovered(d.data?.range ?? null) && <p className="mt-3 text-[12px] text-text-tertiary">{coverageNote}</p>}
    </Card>
  );
}
