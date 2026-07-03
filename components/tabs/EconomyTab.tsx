'use client';

import { useState } from 'react';
import {
  IconArrowsDownUp,
  IconCoins,
  IconFlame,
  IconSparkles,
  IconChartArea,
  IconChartPie,
  IconTrendingDown,
  IconPin,
} from '@tabler/icons-react';
import { useTabData } from '@/lib/use-tab-data';
import type { EconomyResponse } from '@/app/api/economy/route';
import { formatCompact } from '@/lib/format';
import { StatCard } from '@/components/ui/StatCard';
import { Card, CardHeader, CardTag } from '@/components/ui/Card';
import { SupplyHistoryChart } from '@/components/charts/SupplyHistoryChart';
import { TimeChart, type ChartType } from '@/components/charts/TimeChart';
import { ChartTypeToggle } from '@/components/charts/ChartTypeToggle';
import { ProjectionChart } from '@/components/charts/ProjectionChart';
import { DonutChart, type DonutDatum } from '@/components/charts/DonutChart';
import { ChartSkeleton, ErrorState } from '@/components/ui/states';
import { Legend } from './NetworkTab';

const COMP_COLORS = ['#5a656d', 'var(--lavender)', 'var(--blue-soft)', 'var(--mint)', 'var(--gold)'];

export function EconomyTab() {
  const { data, error } = useTabData<EconomyResponse>('/api/economy');
  const [burnMintType, setBurnMintType] = useState<ChartType>('bar');

  if (error) return <ErrorState>Couldn’t load economy data: {error}</ErrorState>;
  if (!data) return <Loading />;

  const { stats } = data;
  const deflation = stats.netInflationPctYr <= 0;

  const compDonut: DonutDatum[] = data.composition.map((c, i) => ({
    name: c.label,
    value: c.pct,
    color: COMP_COLORS[i % COMP_COLORS.length],
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Net Inflation"
          value={`${stats.netInflationPctYr > 0 ? '+' : ''}${stats.netInflationPctYr.toFixed(2)}`}
          unit="%/yr"
          icon={<IconArrowsDownUp size={15} />}
          iconColor="var(--mint)"
          sub="burn ≈ mint (PIP-41)"
          subTrend={deflation ? 'up' : 'down'}
        />
        <StatCard label="Total Supply" value={formatCompact(stats.totalSupplyPokt)} unit="POKT" icon={<IconCoins size={15} />} iconColor="var(--blue-soft)" sub="on-chain" />
        <StatCard label="Burn (7d)" value={formatCompact(stats.burn7dPokt)} unit="POKT" icon={<IconFlame size={15} />} iconColor="var(--coral)" sub="claimed, burned" />
        <StatCard label="Mint (7d)" value={formatCompact(stats.mint7dPokt)} unit="POKT" icon={<IconSparkles size={15} />} iconColor="var(--gold)" sub={`re-minted ×${stats.mintRatio}`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title="Supply History" icon={<IconChartArea size={18} />} tag="1yr · with event pins" />
          {data.pins.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {data.pins.map((p) => (
                <span
                  key={p.date + p.label}
                  title={p.description}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(255,197,71,.3)] bg-[rgba(255,197,71,.08)] px-2.5 py-[3px] text-[12px] text-gold"
                >
                  <IconPin size={13} />
                  {p.label}
                </span>
              ))}
            </div>
          )}
          <SupplyHistoryChart data={data.supplyHistory} pins={data.pins} height={320} />
          <p className="mt-2 text-[12px] italic text-text-tertiary">
            Pins from a version-controlled annotation file, rendered as escaped text.
          </p>
        </Card>
        <Card>
          <CardHeader title="Supply Composition" icon={<IconChartPie size={18} />} tag="current" />
          <DonutChart data={compDonut} height={220} />
          <div className="mt-3.5 flex flex-col gap-2.5 text-[13px]">
            {compDonut.map((d) => (
              <div key={d.name} className="flex items-center gap-2.5">
                <span className="h-[11px] w-[11px] rounded-sm" style={{ background: d.color }} />
                <span className="text-text-secondary">{d.name}</span>
                <span className="ml-auto font-semibold tabular-nums">{d.value.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Burn vs Mint"
            icon={<IconFlame size={18} />}
            right={
              <div className="flex items-center gap-2.5">
                <CardTag>7d · gross</CardTag>
                <ChartTypeToggle value={burnMintType} onChange={setBurnMintType} options={['bar', 'line']} />
              </div>
            }
          />
          <Legend
            items={[
              { label: 'Minted', color: 'var(--gold)' },
              { label: 'Burned', color: 'var(--coral)' },
            ]}
          />
          <TimeChart
            data={data.burnMint as unknown as Array<Record<string, number | string>>}
            series={[
              { key: 'mintPokt', color: 'var(--gold)', label: 'Minted' },
              { key: 'burnPokt', color: 'var(--coral)', label: 'Burned' },
            ]}
            interval="day"
            type={burnMintType}
            projected
            height={240}
            yFmt={(n) => formatCompact(n)}
          />
        </Card>
        <Card>
          <CardHeader title="Supply Projection" icon={<IconTrendingDown size={18} />} tag="demand scenarios · simple" />
          <Legend
            items={[
              { label: 'Low demand', color: 'var(--coral)' },
              { label: 'Current demand', color: 'var(--blue)' },
              { label: 'High demand', color: 'var(--mint)' },
            ]}
          />
          <ProjectionChart data={data.projection} height={240} />
          <p className="mt-2 text-[12px] italic text-text-tertiary">
            All scenarios deflate — supply never grows. Low demand burns least (~−2% by +24mo),
            high demand most (~−10%). Illustrative magnitudes; mechanistic model + scenario
            definitions pending PNF sign-off.
          </p>
        </Card>
      </div>
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
        <ChartSkeleton height={320} />
      </Card>
    </div>
  );
}
