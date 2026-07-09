'use client';

import { IconServer2, IconCoins, IconStack2, IconTrendingUp, IconChartBar, IconChartDonut, IconTable } from '@tabler/icons-react';
import { type RangeKey, SERIES_COLORS, NETWORK_TOTAL_COLOR } from '@/lib/app-config';
import { useTabData } from '@/lib/use-tab-data';
import type { SuppliersResponse } from '@/app/api/suppliers/route';
import type { DomainRow } from '@/lib/data/suppliers';
import { formatNumber, formatCompact } from '@/lib/format';
import { StatCard, type Trend } from '@/components/ui/StatCard';
import { Card, CardHeader } from '@/components/ui/Card';
import { AreaTimeChart } from '@/components/charts/AreaTimeChart';
import { DonutChart, type DonutDatum } from '@/components/charts/DonutChart';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ChartSkeleton, ErrorState } from '@/components/ui/states';

export function SuppliersTab({ range }: { range: RangeKey }) {
  const { data, error } = useTabData<SuppliersResponse>(`/api/suppliers?range=${range}`);

  if (error) return <ErrorState>Couldn’t load supplier data: {error}</ErrorState>;
  if (!data) return <Loading />;

  const { stats } = data;

  // Guard against payload-shape drift: the Vercel Data Cache persists across deploys, so right after a
  // deploy that changes this payload the cache can briefly serve an old-shaped response missing these
  // fields. Never call .toFixed on a possibly-undefined number. (The route also bumps its cache key.)
  const avgSvc = Number.isFinite(stats.avgServicesPerSupplier) ? stats.avgServicesPerSupplier.toFixed(1) : '—';
  const growth = stats.supplierGrowthPct;
  const growthLabel = growth == null ? '—' : `${growth >= 0 ? '+' : ''}${growth.toFixed(1)}%`;
  const growthTrend: Trend = growth == null || growth === 0 ? 'flat' : growth > 0 ? 'up' : 'down';

  // Fit the y-axis to the supplier range (+25% padding) so the trend reads as real movement instead
  // of a flat line pinned near the top of a 0-based axis. Honest for a count metric where 0 is never
  // approached; the padding keeps small changes from looking dramatic.
  const supVals = data.evolution.map((e) => e.suppliers);
  const supMin = supVals.length ? Math.min(...supVals) : 0;
  const supMax = supVals.length ? Math.max(...supVals) : 0;
  const supPad = Math.max(50, Math.round((supMax - supMin) * 0.25));
  const supDomain: [number, number] = [Math.max(0, supMin - supPad), supMax + supPad];

  const donutData: DonutDatum[] = data.concentration.map((c, i) => ({
    name: c.domain,
    value: c.sharePct,
    color: c.domain.startsWith('others') ? NETWORK_TOTAL_COLOR : SERIES_COLORS[i % SERIES_COLORS.length],
  }));

  const columns: Column<DomainRow>[] = [
    {
      key: 'domain',
      header: 'Domain',
      sortValue: (r) => r.domain,
      render: (r) => <span className="font-mono text-[12.5px]">{r.domain}</span>,
    },
    { key: 'suppliers', header: 'Suppliers', align: 'right', sortValue: (r) => r.suppliers, render: (r) => formatNumber(r.suppliers) },
    { key: 'staked', header: 'Total Staked', align: 'right', sortValue: (r) => r.stakedPokt, render: (r) => formatCompact(r.stakedPokt) },
    { key: 'avg', header: 'Avg Stake', align: 'right', sortValue: (r) => r.avgStakePokt, render: (r) => formatCompact(r.avgStakePokt) },
    { key: 'share', header: 'Share', align: 'right', sortValue: (r) => r.sharePct, render: (r) => `${r.sharePct.toFixed(1)}%` },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total Suppliers" value={formatNumber(stats.totalSuppliers)} icon={<IconServer2 size={15} />} iconColor="var(--blue-soft)" sub="as of last daily snapshot" />
        <StatCard label="Total Staked" value={formatCompact(stats.totalStakedPokt)} unit="POKT" icon={<IconCoins size={15} />} iconColor="var(--mint)" />
        <StatCard label="Avg Services / Supplier" value={avgSvc} icon={<IconStack2 size={15} />} iconColor="var(--gold)" sub="staked service configs" />
        <StatCard label="Supplier Growth" value={growthLabel} subTrend={growthTrend} sub={`over ${range}`} icon={<IconTrendingUp size={15} />} iconColor="var(--lavender)" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title="Supplier Base" icon={<IconChartBar size={18} />} tag={`${range} · staked suppliers`} />
          <AreaTimeChart
            data={data.evolution as unknown as Array<Record<string, number | string>>}
            series={[{ key: 'suppliers', color: 'var(--blue)', label: 'Suppliers' }]}
            interval={data.interval}
            height={360}
            yFmt={(n) => formatNumber(Math.round(n))}
            yDomain={supDomain}
          />
        </Card>
        <Card>
          <CardHeader title="Domain Concentration" icon={<IconChartDonut size={18} />} tag="by stake" />
          <DonutChart data={donutData} height={220} />
          <div className="mt-3.5 flex flex-col gap-2.5 text-[13px]">
            {donutData.map((d) => (
              <div key={d.name} className="flex items-center gap-2.5">
                <span className="h-[11px] w-[11px] rounded-sm" style={{ background: d.color }} />
                <span className="truncate font-mono text-[12px] text-text-secondary">{d.name}</span>
                <span className="ml-auto font-semibold tabular-nums">{d.value.toFixed(1)}%</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12px] italic text-text-tertiary">
            Concentration shown honestly — one operator can hold a large share of staked supply.
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader title="Suppliers by Domain" icon={<IconTable size={18} />} tag="aggregate" />
        <DataTable
          rows={data.domains}
          columns={columns}
          rowKey={(r) => r.domain}
          searchText={(r) => r.domain}
          searchPlaceholder="Search domain…"
          initialSortKey="staked"
          initialSortDir="desc"
          pageSize={10}
          unit="domains"
        />
      </Card>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-card border bg-bg-card px-[19px] py-[17px]">
            <span className="skel mb-2 block h-3 w-24" />
            <span className="skel block h-6 w-20" />
          </div>
        ))}
      </div>
      <Card>
        <ChartSkeleton height={260} />
      </Card>
    </div>
  );
}
