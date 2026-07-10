'use client';

import { useMemo, useState } from 'react';
import { IconBolt, IconCpu, IconStack2, IconServer2, IconChartLine, IconTable, IconChartDonut } from '@tabler/icons-react';
import { type RangeKey, SERIES_COLORS, NETWORK_TOTAL_COLOR } from '@/lib/app-config';
import { useTabData } from '@/lib/use-tab-data';
import type { TrafficResponse } from '@/app/api/traffic/route';
import type { ServicePerf } from '@/lib/data/traffic';
import { formatCompact, formatNumber } from '@/lib/format';
import { StatCard, type Trend } from '@/components/ui/StatCard';
import { Card, CardHeader, CardTag } from '@/components/ui/Card';
import { TimeChart, type SeriesDef, type ChartType } from '@/components/charts/TimeChart';
import { ChartTypeToggle } from '@/components/charts/ChartTypeToggle';
import { ChartCsvButton } from '@/components/charts/ChartCsvButton';
import { DonutChart, type DonutDatum } from '@/components/charts/DonutChart';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { MultiSelect, type MultiOption } from '@/components/ui/MultiSelect';
import { ChartSkeleton, ErrorState } from '@/components/ui/states';

const TOTAL_KEY = 'total';

// Human "in the last …" phrase for the active-range window.
const RANGE_DURATION: Record<RangeKey, string> = {
  '24h': '24 hours',
  '7d': '7 days',
  '30d': '30 days',
  '60d': '60 days',
};

function trendOf(pct: number): Trend {
  return pct > 0.05 ? 'up' : pct < -0.05 ? 'down' : 'flat';
}
function changeSub(pct: number) {
  const arrow = pct > 0.05 ? '▲' : pct < -0.05 ? '▼' : '■';
  return `${arrow} ${Math.abs(pct).toFixed(1)}% vs prev`;
}

export function TrafficTab({ range, onOpenService }: { range: RangeKey; onOpenService: (s: { id: string; name: string }) => void }) {
  const { data, error } = useTabData<TrafficResponse>(`/api/traffic?range=${range}`);
  const [chartType, setChartType] = useState<ChartType>('line');
  // Network total is a standalone toggle (its own checkbox), independent of the service dropdown.
  const [showTotal, setShowTotal] = useState(true);
  // User's service selection, scoped to the range it was made in (so a range switch falls back to
  // the fresh default without a state-syncing effect).
  const [selOverride, setSelOverride] = useState<{ range: RangeKey; set: Set<string> } | null>(null);

  // Stable color per service by its rank in the window.
  const colorFor = useMemo(() => {
    const m = new Map<string, string>();
    data?.series.services.forEach((s, i) => m.set(s.id, SERIES_COLORS[i % SERIES_COLORS.length]));
    return m;
  }, [data]);

  // Default selection: top 5 services (network total is controlled separately).
  const defaultSel = useMemo(() => {
    const top5 = data?.series.services.slice(0, 5).map((s) => s.id) ?? [];
    return new Set<string>(top5);
  }, [data]);

  if (error) return <ErrorState>Couldn’t load traffic data: {error}</ErrorState>;
  if (!data) return <TabLoading />;

  const sel = selOverride && selOverride.range === range ? selOverride.set : defaultSel;

  const chartSeries: SeriesDef[] = [];
  if (showTotal) chartSeries.push({ key: TOTAL_KEY, color: NETWORK_TOTAL_COLOR, label: 'Network total' });
  for (const s of data.series.services) {
    if (sel.has(s.id)) chartSeries.push({ key: s.id, color: colorFor.get(s.id)!, label: s.id });
  }

  const msOptions: MultiOption[] = data.series.services.map((s) => ({ id: s.id, label: s.id, color: colorFor.get(s.id)! }));

  const donutData: DonutDatum[] = data.donut.map((d) => ({
    name: d.name,
    value: d.sharePct,
    color: d.serviceId === '__others__' ? NETWORK_TOTAL_COLOR : (colorFor.get(d.serviceId) ?? NETWORK_TOTAL_COLOR),
  }));

  const columns: Column<ServicePerf>[] = [
    {
      key: 'service',
      header: 'Service',
      sortValue: (r) => r.serviceId,
      render: (r) => (
        <button
          type="button"
          onClick={() => onOpenService({ id: r.serviceId, name: r.serviceName })}
          className="font-medium text-blue-soft hover:underline"
          title={`View ${r.serviceId} details`}
        >
          {r.serviceId}
        </button>
      ),
    },
    { key: 'label', header: 'Label', sortValue: (r) => r.serviceName, render: (r) => r.serviceName || '—', hideOnMobile: true },
    {
      key: 'net',
      header: 'Net %',
      align: 'right',
      sortValue: (r) => r.sharePct,
      render: (r) => `${r.sharePct.toFixed(1)}%`,
    },
    {
      key: 'change',
      header: 'Change',
      align: 'right',
      hideOnMobile: true,
      sortValue: (r) => r.change,
      render: (r) => (
        <span className={r.change > 0.05 ? 'text-mint' : r.change < -0.05 ? 'text-coral' : ''}>
          {r.change >= 0 ? '+' : ''}
          {r.change.toFixed(1)}%
        </span>
      ),
    },
    {
      key: 'cu',
      header: 'Computed Units',
      align: 'right',
      sortValue: (r) => r.estimatedComputedUnits,
      render: (r) => formatCompact(r.estimatedComputedUnits),
    },
    {
      key: 'relays',
      header: 'Relays',
      align: 'right',
      hideOnMobile: true,
      sortValue: (r) => r.estimatedRelays,
      render: (r) => formatCompact(r.estimatedRelays),
    },
  ];

  const { stats } = data;

  return (
    <div className="flex flex-col gap-4">
      {/* stat cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="24h Relays"
          value={formatCompact(stats.relays24h)}
          icon={<IconBolt size={15} />}
          iconColor="var(--blue-soft)"
          sub={changeSub(stats.relays24hChange)}
          subTrend={trendOf(stats.relays24hChange)}
        />
        <StatCard
          label="24h Computed Units"
          value={formatCompact(stats.cu24h)}
          icon={<IconCpu size={15} />}
          iconColor="var(--gold)"
          sub={changeSub(stats.cu24hChange)}
          subTrend={trendOf(stats.cu24hChange)}
        />
        <StatCard
          label="Active Services"
          value={formatNumber(stats.activeServices)}
          icon={<IconStack2 size={15} />}
          iconColor="var(--mint)"
          sub={`of ${formatNumber(stats.totalServices)} total in the last ${RANGE_DURATION[range]}`}
        />
        <StatCard
          label="Staked Suppliers"
          value={stats.servingSuppliers != null ? formatNumber(stats.servingSuppliers) : '—'}
          icon={<IconServer2 size={15} />}
          iconColor="var(--lavender)"
          sub="as of last daily snapshot"
        />
      </div>

      {/* Traffic Over Time */}
      <Card>
        <CardHeader
          title="Traffic Over Time"
          icon={<IconChartLine size={18} />}
          right={
            <div className="flex flex-wrap items-center justify-end gap-2.5">
              <CardTag>estimated CU</CardTag>
              <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-text-secondary">
                <input
                  type="checkbox"
                  checked={showTotal}
                  onChange={() => setShowTotal((v) => !v)}
                  style={{ accentColor: NETWORK_TOTAL_COLOR }}
                />
                Show network total
              </label>
              <ChartTypeToggle value={chartType} onChange={setChartType} options={['line', 'bar']} />
              <ChartCsvButton data={data.series.rows} series={chartSeries} name="traffic-over-time" range={range} />
              <MultiSelect
                options={msOptions}
                selected={sel}
                onToggle={(id) => {
                  const next = new Set(sel);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  setSelOverride({ range, set: next });
                }}
                onSelectAll={(ids, select) => {
                  const next = new Set(sel);
                  for (const id of ids) {
                    if (select) next.add(id);
                    else next.delete(id);
                  }
                  setSelOverride({ range, set: next });
                }}
                selectAllLabel="All"
                buttonLabel={`Services (${sel.size})`}
              />
            </div>
          }
        />
        <div className="mb-3 flex flex-wrap gap-3.5 text-[12px] text-text-secondary">
          {chartSeries.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
        <TimeChart data={data.series.rows} series={chartSeries} interval={data.series.interval} type={chartType} projected height={360} />
        <p className="mt-2 text-[12px] italic text-text-tertiary">
          Default view: network total + top 5 services. Use the Services control to toggle any of the {data.series.services.length} sources. Estimated computed units (demand signal)
          {data.series.interval !== 'hour' && '; the current day is dashed/projected to its full-day estimate'}.
        </p>
      </Card>

      {/* performance + distribution */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader
            title="Service Performance"
            icon={<IconTable size={18} />}
            tag={`${range} · change vs prev period`}
          />
          <DataTable
            rows={data.performance}
            columns={columns}
            rowKey={(r) => r.serviceId}
            searchText={(r) => `${r.serviceId} ${r.serviceName}`}
            searchPlaceholder="Search service…"
            initialSortKey="net"
            initialSortDir="desc"
            pageSize={10}
            unit="services"
            csvName="service-performance"
            range={range}
          />
        </Card>
        <Card>
          <CardHeader title="Distribution" icon={<IconChartDonut size={18} />} tag={`${range} · CU share`} />
          <DonutChart data={donutData} height={220} />
          <div className="mt-3.5 flex flex-col gap-2.5 text-[13px]">
            {donutData.map((d) => (
              <div key={d.name} className="flex items-center gap-2.5">
                <span className="h-[11px] w-[11px] rounded-sm" style={{ background: d.color }} />
                <span className="text-text-secondary">{d.name}</span>
                <span className="ml-auto font-semibold tabular-nums">{d.value.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function TabLoading() {
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
        <ChartSkeleton height={360} />
      </Card>
    </div>
  );
}
