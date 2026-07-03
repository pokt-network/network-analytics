'use client';

import { useState } from 'react';
import {
  IconShieldCheck,
  IconServer2,
  IconApps,
  IconRouter,
  IconChartLine,
  IconUsersGroup,
  IconCoins,
} from '@tabler/icons-react';
import { type RangeKey } from '@/lib/app-config';
import { useTabData } from '@/lib/use-tab-data';
import type { NetworkResponse } from '@/app/api/network/route';
import { formatNumber, formatCompact } from '@/lib/format';
import { StatCard } from '@/components/ui/StatCard';
import { Card, CardHeader, CardTag } from '@/components/ui/Card';
import { AreaTimeChart } from '@/components/charts/AreaTimeChart';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { TimeChart, type ChartType } from '@/components/charts/TimeChart';
import { ChartTypeToggle } from '@/components/charts/ChartTypeToggle';
import { ChartSkeleton, ErrorState } from '@/components/ui/states';

const SNAP = 'as of last daily snapshot';

export function NetworkTab({ range }: { range: RangeKey }) {
  const { data, error } = useTabData<NetworkResponse>(`/api/network?range=${range}`);
  const [claimsType, setClaimsType] = useState<ChartType>('area');

  if (error) return <ErrorState>Couldn’t load network data: {error}</ErrorState>;
  if (!data) return <Loading />;

  const { stats } = data;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Staked Validators" value={formatNumber(stats.stakedValidators)} icon={<IconShieldCheck size={15} />} iconColor="var(--lavender)" sub="bonded" />
        <StatCard label="Staked Suppliers" value={formatNumber(stats.stakedSuppliers)} icon={<IconServer2 size={15} />} iconColor="var(--blue-soft)" sub={SNAP} />
        <StatCard label="Staked Apps" value={formatNumber(stats.stakedApps)} icon={<IconApps size={15} />} iconColor="var(--mint)" sub={SNAP} />
        <StatCard label="Staked Gateways" value={formatNumber(stats.stakedGateways)} icon={<IconRouter size={15} />} iconColor="var(--gold)" sub={SNAP} />
      </div>

      <Card>
        <CardHeader
          title="Claims / Proofs / Expired"
          icon={<IconChartLine size={18} />}
          right={
            <div className="flex items-center gap-2.5">
              <CardTag>{range} · claimed CU</CardTag>
              <ChartTypeToggle value={claimsType} onChange={setClaimsType} options={['area', 'bar']} />
            </div>
          }
        />
        <Legend
          items={[
            { label: 'Claim', color: 'var(--lavender)' },
            { label: 'Proof', color: 'var(--mint)' },
            { label: 'Expired Proof', color: 'var(--coral)' },
          ]}
        />
        <TimeChart
          data={data.claims as unknown as Array<Record<string, number | string>>}
          series={[
            { key: 'claimCU', color: 'var(--lavender)', label: 'Claim' },
            { key: 'proofCU', color: 'var(--mint)', label: 'Proof' },
            { key: 'expiredCU', color: 'var(--coral)', label: 'Expired Proof' },
          ]}
          interval={data.interval}
          type={claimsType}
          projected
          height={340}
        />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Participation Evolution" icon={<IconUsersGroup size={18} />} tag={`${range} · counts`} />
          <Legend
            items={[
              { label: 'Suppliers', color: 'var(--blue)' },
              { label: 'Apps', color: 'var(--mint)' },
              { label: 'Validators', color: 'var(--lavender)' },
            ]}
          />
          <TimeSeriesChart
            data={data.participation as unknown as Array<Record<string, number | string>>}
            series={[
              { key: 'suppliers', color: 'var(--blue)', label: 'Suppliers' },
              { key: 'apps', color: 'var(--mint)', label: 'Apps' },
              { key: 'validators', color: 'var(--lavender)', label: 'Validators' },
            ]}
            interval={data.interval}
            height={260}
          />
        </Card>
        <Card>
          <CardHeader title="Staked POKT Evolution" icon={<IconCoins size={18} />} tag={`${range} · suppliers`} />
          <AreaTimeChart
            data={data.staked as unknown as Array<Record<string, number | string>>}
            series={[{ key: 'supplierPokt', color: 'var(--blue)', label: 'Staked POKT' }]}
            interval={data.interval}
            height={260}
            yFmt={(n) => `${formatCompact(n)}`}
          />
        </Card>
      </div>
    </div>
  );
}

export function Legend({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <div className="mb-3 flex flex-wrap gap-3.5 text-[12px] text-text-secondary">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
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
            <span className="skel block h-6 w-16" />
          </div>
        ))}
      </div>
      <Card>
        <ChartSkeleton height={340} />
      </Card>
    </div>
  );
}
