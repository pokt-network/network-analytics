'use client';

import { useState } from 'react';
import { IconSearch, IconCpu, IconBolt, IconServer2, IconCoin, IconChartLine, IconInfoCircle, IconList, IconX } from '@tabler/icons-react';
import { type RangeKey, RANGE_SPECS } from '@/lib/app-config';
import { useTabData } from '@/lib/use-tab-data';
import type { ServiceDetail } from '@/lib/data/services';
import type { ServiceAnalyticsRow } from '@/app/api/services/analytics/route';
import { formatCompact, formatNumber } from '@/lib/format';
import { StatCard } from '@/components/ui/StatCard';
import { Card, CardHeader, CardTag } from '@/components/ui/Card';
import { TimeChart, type ChartType, type SeriesDef } from '@/components/charts/TimeChart';
import { ChartTypeToggle } from '@/components/charts/ChartTypeToggle';
import { ChartCsvButton } from '@/components/charts/ChartCsvButton';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ChartSkeleton, ErrorState } from '@/components/ui/states';
import { ServicePicker, type ServiceItem } from './ServicePicker';

const LIST_PAGE_SIZE = 50;

const VOLUME_SERIES: SeriesDef[] = [{ key: 'estimatedCU', color: 'var(--blue)', label: 'Estimated CU' }];

// `svc` is owned by the Dashboard so other tabs can open a service here (see onOpenService).
export function ServicesTab({
  range,
  svc,
  onSelectService,
}: {
  range: RangeKey;
  svc: ServiceItem | null;
  onSelectService: (s: ServiceItem | null) => void;
}) {
  const [volType, setVolType] = useState<ChartType>('line');
  // Top-level analytics table (range-aware suppliers + CU), and the full id/name list for the picker.
  const analytics = useTabData<{ services: ServiceAnalyticsRow[] }>(`/api/services/analytics?range=${range}`);
  const pickerList = useTabData<{ services: ServiceItem[] }>('/api/services/list');
  const detailUrl = svc ? `/api/services?serviceId=${encodeURIComponent(svc.id)}&range=${range}` : '';
  const { data, error } = useTabData<ServiceDetail>(detailUrl);

  const rows = analytics.data?.services ?? [];

  // Resolve a display label for the picker. A deep-linked service arrives with only its id, so look
  // up the real name from the loaded list; fall back to the id alone until (or unless) it's known.
  const svcLabel = svc
    ? (() => {
        const name = pickerList.data?.services.find((s) => s.id === svc.id)?.name || (svc.name !== svc.id ? svc.name : '');
        return name ? `${svc.id} — ${name}` : svc.id;
      })()
    : undefined;

  const columns: Column<ServiceAnalyticsRow>[] = [
    { key: 'service', header: 'Service', sortValue: (r) => r.id, render: (r) => <span className="font-medium text-blue-soft">{r.id}</span> },
    { key: 'name', header: 'Name', sortValue: (r) => r.name, render: (r) => r.name || '—', hideOnMobile: true },
    { key: 'suppliers', header: 'Suppliers', align: 'right', sortValue: (r) => r.suppliers, render: (r) => formatNumber(r.suppliers) },
    { key: 'cu', header: `CU (${range})`, align: 'right', sortValue: (r) => r.cu, render: (r) => formatCompact(r.cu) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader
          title="Find a Service"
          icon={<IconSearch size={18} />}
          right={<span className="text-[11px] text-text-secondary">{pickerList.data?.services.length || '100+'} services on network</span>}
        />
        <div className="flex items-center gap-2.5">
          <ServicePicker onSelect={onSelectService} selectedLabel={svcLabel} items={pickerList.data?.services ?? []} />
          {svc && (
            <button
              type="button"
              onClick={() => onSelectService(null)}
              className="flex h-11 shrink-0 items-center gap-1.5 rounded-[10px] border bg-bg-surface px-3.5 text-[13px] font-medium text-text-secondary hover:border-line-hover hover:text-text-primary"
              title="Clear selection — back to all services"
            >
              <IconX size={15} />
              Clear
            </button>
          )}
        </div>
      </Card>

      {/* Default view: service analytics — suppliers + windowed CU, sortable. */}
      {!svc && (
        <Card>
          <CardHeader title="Service Analytics" icon={<IconList size={18} />} tag={`${rows.length} active · CU over ${range}`} />
          {analytics.error ? (
            <ErrorState>Couldn’t load services: {analytics.error}</ErrorState>
          ) : !analytics.data ? (
            <ChartSkeleton height={220} />
          ) : (
            <DataTable
              rows={rows}
              columns={columns}
              rowKey={(r) => r.id}
              searchText={(r) => `${r.id} ${r.name}`}
              searchPlaceholder="Search service…"
              initialSortKey="cu"
              initialSortDir="desc"
              pageSize={LIST_PAGE_SIZE}
              unit="services"
              csvName="service-analytics"
              range={range}
              onRowClick={(r) => onSelectService({ id: r.id, name: r.name })}
            />
          )}
        </Card>
      )}

      {svc && error && <ErrorState>Couldn’t load service data: {error}</ErrorState>}
      {svc && !data && !error && (
        <Card>
          <ChartSkeleton height={260} />
        </Card>
      )}

      {svc && data && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label={`CU (${range})`} value={formatCompact(data.stats.cu)} icon={<IconCpu size={15} />} iconColor="var(--blue-soft)" sub="estimated" />
            <StatCard label={`Relays (${range})`} value={formatCompact(data.stats.relays)} icon={<IconBolt size={15} />} iconColor="var(--gold)" sub="estimated" />
            <StatCard label="Suppliers Staked" value={formatCompact(data.stats.suppliers)} icon={<IconServer2 size={15} />} iconColor="var(--lavender)" />
            <StatCard label={`Gross Rewards (${range})`} value={formatCompact(data.stats.grossRewardsPokt)} unit="POKT" icon={<IconCoin size={15} />} iconColor="var(--mint)" sub="claimed" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
            <Card>
              <CardHeader
                title={`${data.info.id} — Volume Trend`}
                icon={<IconChartLine size={18} />}
                right={
                  <div className="flex flex-wrap items-center justify-end gap-2.5">
                    <CardTag>{range} · estimated CU</CardTag>
                    <ChartTypeToggle value={volType} onChange={setVolType} options={['line', 'bar']} />
                    <ChartCsvButton
                      data={data.series as unknown as Array<Record<string, number | string>>}
                      series={VOLUME_SERIES}
                      name={`service-${data.info.id}-volume`}
                      range={range}
                    />
                  </div>
                }
              />
              <TimeChart
                data={data.series as unknown as Array<Record<string, number | string>>}
                series={VOLUME_SERIES}
                interval={RANGE_SPECS[range].interval}
                type={volType}
                projected
                height={280}
              />
              {RANGE_SPECS[range].interval !== 'hour' && (
                <p className="mt-2 text-[11px] italic text-text-tertiary">
                  Current {RANGE_SPECS[range].interval} is dashed — projected to its full-period estimate.
                </p>
              )}
            </Card>
            <Card>
              <CardHeader title="Service Info" icon={<IconInfoCircle size={18} />} />
              <table className="w-full text-[13px]">
                <tbody>
                  <InfoRow k="Service ID" v={<span className="font-mono">{data.info.id}</span>} />
                  <InfoRow k="Label" v={data.info.name} />
                  <InfoRow k="Apps staked" v={formatCompact(data.info.appsStaked)} />
                  <InfoRow k="Suppliers staked" v={formatCompact(data.info.suppliersStaked)} />
                  <InfoRow
                    k="CU per relay"
                    v={formatNumber(Math.round(data.stats.relays > 0 ? data.stats.cu / data.stats.relays : 0))}
                  />
                  <InfoRow k="Network share" v={`${data.info.sharePct.toFixed(1)}%`} />
                </tbody>
              </table>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function InfoRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <tr className="border-b last:border-b-0">
      <td className="py-2.5 text-text-secondary">{k}</td>
      <td className="py-2.5 text-right tabular-nums">{v}</td>
    </tr>
  );
}
