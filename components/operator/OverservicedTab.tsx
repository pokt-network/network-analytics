'use client';

import { useMemo } from 'react';
import { IconChartArea } from '@tabler/icons-react';
import { useStakingTool } from '@/components/staking/StakingToolContext';
import { useTabData } from '@/lib/use-tab-data';
import type { OverservicedPoint } from '@/lib/data/operator';
import { Card, CardHeader } from '@/components/ui/Card';
import { TimeChart, type SeriesDef } from '@/components/charts/TimeChart';
import { ChartSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { formatCompact } from '@/lib/format';

const SERIES: SeriesDef[] = [
  { key: 'effectivePokt', color: '#48e5c2', label: 'Effective burn' },
  { key: 'expectedPokt', color: '#b8b8ff', label: 'Expected burn' },
];

// Effective (actual) vs expected burn over time. A gap where effective < expected is overservicing —
// relays served beyond what the application paid for.
export function OverservicedTab() {
  const { addresses, range } = useStakingTool();
  const d = useTabData<OverservicedPoint[]>(
    addresses.length ? `/api/operator/overserviced?addresses=${addresses.join(',')}&range=${range}` : '',
    { prefetchSiblings: false },
  );
  const poktFmt = useMemo(() => (n: number) => formatCompact(n), []);

  return (
    <Card>
      <CardHeader title="Overservicing — Effective vs Expected" icon={<IconChartArea size={18} />} right={<span className="text-[12px] text-text-tertiary">POKT burn</span>} />
      {d.error && !d.data ? (
        <ErrorState>Couldn&apos;t load overservicing for this range — try a shorter range.</ErrorState>
      ) : !d.data ? (
        <ChartSkeleton height={300} />
      ) : d.data.length === 0 ? (
        <EmptyState>No burn activity in this window.</EmptyState>
      ) : (
        <TimeChart data={d.data as unknown as Array<Record<string, number | string | null>>} series={SERIES} interval={range === '24h' ? 'hour' : 'day'} type="line" height={300} yFmt={poktFmt} />
      )}
    </Card>
  );
}
