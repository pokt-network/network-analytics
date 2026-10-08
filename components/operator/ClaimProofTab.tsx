'use client';

import { IconChartBar } from '@tabler/icons-react';
import { useStakingTool } from '@/components/staking/StakingToolContext';
import { useTabData } from '@/lib/use-tab-data';
import type { ClaimProofPoint } from '@/lib/data/operator';
import { Card, CardHeader } from '@/components/ui/Card';
import { GroupedBarChart } from '@/components/charts/GroupedBarChart';
import { ChartSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { formatNumber } from '@/lib/format';

const BARS = [
  { key: 'claims', color: '#4c9bf5', label: 'Claims' },
  { key: 'proofs', color: '#48e5c2', label: 'Proofs' },
  { key: 'expired', color: '#ff5a5f', label: 'Expired' },
];

// Claim / proof / expired event counts per bucket, across the operator's rev-share addresses. "Proof"
// here counts settled claims; "Expired" counts claims that expired (proof missing/invalid).
export function ClaimProofTab() {
  const { addresses, range } = useStakingTool();
  const d = useTabData<ClaimProofPoint[]>(
    addresses.length ? `/api/operator/claim-proof?addresses=${addresses.join(',')}&range=${range}` : '',
    { prefetchSiblings: false },
  );

  return (
    <Card>
      <CardHeader title="Claims / Proofs / Expired" icon={<IconChartBar size={18} />} right={<span className="text-[12px] text-text-tertiary">event counts</span>} />
      {d.error && !d.data ? (
        <ErrorState>Couldn&apos;t load claim activity for this range — try a shorter range.</ErrorState>
      ) : !d.data ? (
        <ChartSkeleton height={300} />
      ) : d.data.length === 0 ? (
        <EmptyState>No claim activity in this window.</EmptyState>
      ) : (
        <GroupedBarChart data={d.data as unknown as Array<Record<string, number | string>>} bars={BARS} interval={range === '24h' ? 'hour' : 'day'} height={300} yFmt={(n) => formatNumber(n)} />
      )}
    </Card>
  );
}
