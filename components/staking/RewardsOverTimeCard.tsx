'use client';

import { useMemo, useState } from 'react';
import { IconChartLine } from '@tabler/icons-react';
import { NETWORK_TOTAL_COLOR } from '@/lib/app-config';
import { useTabData } from '@/lib/use-tab-data';
import type { OwnerResponse } from '@/app/api/owner/route';
import { formatCompact, truncate } from '@/lib/format';
import { Card, CardHeader } from '@/components/ui/Card';
import { RangePills } from '@/components/dashboard/RangePills';
import { TimeChart, type SeriesDef, type ChartType } from '@/components/charts/TimeChart';
import { ChartTypeToggle } from '@/components/charts/ChartTypeToggle';
import { ChartSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { rangeNote } from '@/lib/data/coverage';
import { useStakingTool } from './StakingToolContext';
import type { RangeKey } from '@/lib/app-config';

// Rewards-over-time card shared by both staking tools. The underlying resolver is rev-share-recipient
// keyed (getRewardsByAddressesAndTime*), which is the right semantics for both an owner watching their
// payout addresses and an operator watching their node addresses — so one compact, scalable endpoint
// (/api/owner) backs both. Per-address series by default; Group All collapses to one total.
export function RewardsOverTimeCard({
  ranges,
  prefetchSiblings = true,
}: {
  ranges?: RangeKey[];
  prefetchSiblings?: boolean;
} = {}) {
  const { addresses, range, setRange, colorFor } = useStakingTool();
  const [groupAll, setGroupAll] = useState(false);
  const [chartType, setChartType] = useState<ChartType>('line');

  const addrParam = addresses.join(',');
  const rewards = useTabData<OwnerResponse>(
    addresses.length ? `/api/owner?addresses=${addrParam}&range=${range}&group=${groupAll ? 1 : 0}` : '',
    { prefetchSiblings },
  );

  const series: SeriesDef[] = groupAll
    ? [{ key: 'total', color: NETWORK_TOTAL_COLOR, label: 'All addresses' }]
    : addresses.map((a) => ({ key: a, color: colorFor(a), label: truncate(a, 8, 5) }));

  const poktFmt = useMemo(() => (n: number) => formatCompact(n), []);

  // What the indexer actually covered of the window (newer indexers report it) — surfaced so a partial
  // or lagging answer is never read as a real dip.
  const coverageNote = rewards.error ? null : rangeNote(rewards.data?.rewards.range ?? null, range === '24h' ? 'hour' : 'day');

  return (
    <Card className="mb-4">
      <CardHeader
        title="Rewards Over Time"
        icon={<IconChartLine size={18} />}
        right={
          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setGroupAll((g) => !g)}
              className={`rounded-lg border px-3 py-1.5 text-[13px] font-medium ${groupAll ? 'border-blue bg-[rgba(2,90,242,.1)] text-blue-soft' : 'text-text-secondary hover:text-text-primary'}`}
            >
              Group All
            </button>
            <ChartTypeToggle value={chartType} onChange={setChartType} options={['line', 'bar']} />
            <RangePills value={range} onChange={setRange} ranges={ranges} />
          </div>
        }
      />
      {rewards.error && !rewards.data ? (
        <ErrorState>Couldn&apos;t load rewards for this range — try a shorter range.</ErrorState>
      ) : !rewards.data ? (
        <ChartSkeleton height={280} />
      ) : rewards.data.rewards.rows.length === 0 ? (
        <EmptyState>No rewards in this window.</EmptyState>
      ) : (
        <TimeChart
          data={rewards.data.rewards.rows}
          series={series}
          interval={range === '24h' ? 'hour' : 'day'}
          type={chartType}
          height={280}
          yFmt={poktFmt}
        />
      )}
      {coverageNote && <p className="mt-3 text-[12px] text-text-tertiary">{coverageNote}</p>}
    </Card>
  );
}
