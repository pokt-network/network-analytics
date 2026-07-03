'use client';

import { useState } from 'react';
import { IconSearch, IconCpu, IconBolt, IconServer2, IconCoin, IconChartLine, IconInfoCircle, IconList, IconArrowLeft } from '@tabler/icons-react';
import { type RangeKey, RANGE_SPECS } from '@/lib/app-config';
import { useTabData } from '@/lib/use-tab-data';
import type { ServiceDetail } from '@/lib/data/services';
import { formatCompact } from '@/lib/format';
import { StatCard } from '@/components/ui/StatCard';
import { Card, CardHeader } from '@/components/ui/Card';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ChartSkeleton, ErrorState } from '@/components/ui/states';
import { ServicePicker, type ServiceItem } from './ServicePicker';

const LIST_PAGE_SIZE = 50;

export function ServicesTab({ range }: { range: RangeKey }) {
  const [svc, setSvc] = useState<ServiceItem | null>(null);
  const list = useTabData<{ services: ServiceItem[] }>('/api/services/list');
  const detailUrl = svc ? `/api/services?serviceId=${encodeURIComponent(svc.id)}&range=${range}` : '';
  const { data, error } = useTabData<ServiceDetail>(detailUrl);

  const services = list.data?.services ?? [];

  const listColumns: Column<ServiceItem>[] = [
    { key: 'service', header: 'Service', sortValue: (r) => r.id, render: (r) => <span className="font-medium text-blue-soft">{r.id}</span> },
    { key: 'name', header: 'Name', sortValue: (r) => r.name, render: (r) => r.name || '—' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader
          title="Find a Service"
          icon={<IconSearch size={18} />}
          right={
            svc ? (
              <button
                type="button"
                onClick={() => setSvc(null)}
                className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium text-text-secondary hover:border-line-hover hover:text-text-primary"
              >
                <IconArrowLeft size={14} />
                All services
              </button>
            ) : (
              <span className="text-[11px] text-text-secondary">{services.length || '100+'} services on network</span>
            )
          }
        />
        <ServicePicker onSelect={setSvc} selectedLabel={svc ? `${svc.id} — ${svc.name}` : undefined} items={services} />
      </Card>

      {/* Default view: browsable, paginated list of all services. */}
      {!svc && (
        <Card>
          <CardHeader title="All Services" icon={<IconList size={18} />} tag={`${services.length} total`} />
          {list.error ? (
            <ErrorState>Couldn’t load services: {list.error}</ErrorState>
          ) : !list.data ? (
            <ChartSkeleton height={200} />
          ) : (
            <DataTable
              rows={services}
              columns={listColumns}
              rowKey={(r) => r.id}
              searchText={(r) => `${r.id} ${r.name}`}
              searchPlaceholder="Search service…"
              initialSortKey="service"
              initialSortDir="asc"
              pageSize={LIST_PAGE_SIZE}
              unit="services"
              onRowClick={(r) => setSvc(r)}
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
            <StatCard label="Suppliers Serving" value={formatCompact(data.stats.suppliers)} icon={<IconServer2 size={15} />} iconColor="var(--lavender)" />
            <StatCard label="Gross Rewards" value={formatCompact(data.stats.grossRewardsPokt)} unit="POKT" icon={<IconCoin size={15} />} iconColor="var(--mint)" sub="claimed" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
            <Card>
              <CardHeader title={`${data.info.id} — Volume Trend`} icon={<IconChartLine size={18} />} tag={`${range} · estimated CU`} />
              <TimeSeriesChart
                data={data.series as unknown as Array<Record<string, number | string>>}
                series={[{ key: 'estimatedCU', color: 'var(--blue)', label: 'Estimated CU' }]}
                interval={RANGE_SPECS[range].interval}
                height={280}
              />
            </Card>
            <Card>
              <CardHeader title="Service Info" icon={<IconInfoCircle size={18} />} />
              <table className="w-full text-[13px]">
                <tbody>
                  <InfoRow k="Service ID" v={<span className="font-mono">{data.info.id}</span>} />
                  <InfoRow k="Label" v={data.info.name} />
                  <InfoRow k="Apps staked" v={formatCompact(data.info.appsStaked)} />
                  <InfoRow k="Suppliers staked" v={formatCompact(data.info.suppliersStaked)} />
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
