'use client';

import { useMemo, useState } from 'react';
import { IconChartLine, IconX } from '@tabler/icons-react';
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

const CHART_HEIGHT = 300;

// The tracked-address list, shown as a column beside the chart so each line's color sits next to its
// address (a legend + watchlist in one). Scrolls internally when the list is long; each row removes
// its address. Replaces the disconnected pill strip that used to live under the address input.
function TrackedAddresses() {
  const { addresses, colorFor, setAddresses, cap } = useStakingTool();
  return (
    <div
      className="flex shrink-0 flex-col rounded-[10px] border bg-bg-surface sm:w-[210px]"
      style={{ maxHeight: CHART_HEIGHT }}
    >
      <div className="flex items-center justify-between border-b px-3 py-2 text-[11px] font-medium uppercase tracking-[0.5px] text-text-secondary">
        <span>Tracked</span>
        <span className="text-text-tertiary">{addresses.length} / {cap}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {addresses.map((a) => (
          <div key={a} className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-bg-card-hover">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colorFor(a) }} />
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-text-secondary" title={a}>
              {truncate(a, 8, 5)}
            </span>
            <button
              type="button"
              onClick={() => setAddresses(addresses.filter((x) => x !== a))}
              aria-label={`Remove ${a}`}
              title="Remove"
              className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full text-text-tertiary opacity-0 transition-opacity hover:text-coral focus:opacity-100 group-hover:opacity-100"
            >
              <IconX size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Rewards-over-time card shared by both staking tools. The underlying resolver is rev-share-recipient
// keyed (the legacy settlement-table resolvers), which is the right semantics for both an owner
// watching their payout addresses and an operator watching their node addresses — so one endpoint
// (/api/owner) backs both. Per-address series by default; Group All collapses to one total. The
// tracked-address list sits beside the chart as a color legend.
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

  const chart =
    rewards.error && !rewards.data ? (
      <ErrorState>Couldn&apos;t load rewards for this range — try a shorter range.</ErrorState>
    ) : !rewards.data ? (
      <ChartSkeleton height={CHART_HEIGHT} />
    ) : rewards.data.rewards.rows.length === 0 ? (
      <EmptyState>No rewards in this window.</EmptyState>
    ) : (
      <TimeChart
        data={rewards.data.rewards.rows}
        series={series}
        interval={range === '24h' ? 'hour' : 'day'}
        type={chartType}
        height={CHART_HEIGHT}
        yFmt={poktFmt}
      />
    );

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
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="min-w-0 flex-1" style={{ minHeight: CHART_HEIGHT }}>
          {chart}
        </div>
        <TrackedAddresses />
      </div>
      {coverageNote && <p className="mt-3 text-[12px] text-text-tertiary">{coverageNote}</p>}
    </Card>
  );
}
