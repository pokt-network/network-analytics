'use client';

import { useState } from 'react';
import { IconWallet, IconCoin, IconUsers, IconChartLine, IconReceipt, IconListDetails } from '@tabler/icons-react';
import { OWNER_ADDRESS_CAP } from '@/lib/app-config';
import { useTabData } from '@/lib/use-tab-data';
import type { OwnerSummary } from '@/lib/data/owner';
import type { OwnerResponse } from '@/app/api/owner/route';
import { rangeNote } from '@/lib/data/coverage';
import { formatNumber, formatCompact } from '@/lib/format';
import { StatCard } from '@/components/ui/StatCard';
import { EmptyState } from '@/components/ui/states';
import { StakingToolProvider, useStakingTool } from '@/components/staking/StakingToolContext';
import { SupplierToolLayout } from '@/components/staking/SupplierToolLayout';
import { RewardsOverTimeCard } from '@/components/staking/RewardsOverTimeCard';
import { Tabs, type TabDef } from '@/components/staking/Tabs';
import { OwnerSuppliersTab } from './OwnerSuppliersTab';
import { RewardIssuancesTab } from './RewardIssuancesTab';

// Preserve the existing localStorage key so owners who already saved a watchlist keep it.
const STORE_KEY = 'pnf-analytics-owner-addresses';

const TABS: TabDef[] = [
  { key: 'suppliers', label: 'Suppliers', icon: <IconUsers size={15} /> },
  { key: 'issuances', label: 'Reward Issuances', icon: <IconListDetails size={15} /> },
];

export function OwnerStakingView() {
  return (
    <StakingToolProvider storeKey={STORE_KEY} cap={OWNER_ADDRESS_CAP}>
      <SupplierToolLayout
        title="Owner Staking"
        description="Track the suppliers you own — fleet rewards, stake, and settlement history"
        icon={<IconWallet size={22} className="text-blue-soft" />}
        actionLabel="View Rewards"
        emptyState={
          <EmptyState>
            Add one or more <span className="font-mono">pokt1…</span> owner addresses to see your fleet&apos;s
            rewards and settlement history.
          </EmptyState>
        }
      >
        <OwnerBody />
      </SupplierToolLayout>
    </StakingToolProvider>
  );
}

function OwnerBody() {
  const { addresses, range } = useStakingTool();
  const [tab, setTab] = useState('suppliers');

  const addrParam = addresses.join(',');
  // Fleet rollup (range-independent): supplier count + combined stake.
  const summary = useTabData<OwnerSummary>(addrParam ? `/api/staking/owner-summary?addresses=${addrParam}` : '');
  // Range-dependent rewards total + settled-claims count (+ coverage), from the settlement catalog.
  // group=0 so this shares /api/owner's cache entry with the chart in the common (ungrouped) case.
  const owner = useTabData<OwnerResponse>(addrParam ? `/api/owner?addresses=${addrParam}&range=${range}&group=0` : '');

  const interval = range === '24h' ? 'hour' : 'day';
  const totalNote = owner.error ? null : rangeNote(owner.data?.totalRange ?? null, interval);
  const settledNote = owner.error ? null : rangeNote(owner.data?.settledRange ?? null, interval);

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Suppliers"
          value={summary.data ? formatNumber(summary.data.supplierCount) : '—'}
          icon={<IconUsers size={15} />}
          iconColor="var(--lavender)"
          sub="owned, all states"
          loading={!summary.data}
        />
        <StatCard
          label="Staked Tokens"
          value={summary.data ? formatCompact(summary.data.stakedPokt) : '—'}
          unit="POKT"
          icon={<IconCoin size={15} />}
          iconColor="var(--mint)"
          loading={!summary.data}
        />
        <StatCard
          label={`Rewards (${range})`}
          value={owner.data ? (owner.data.totalPokt == null ? '—' : formatCompact(owner.data.totalPokt)) : '—'}
          unit={owner.data?.totalPokt == null ? undefined : 'POKT'}
          icon={<IconChartLine size={15} />}
          iconColor="var(--blue-soft)"
          sub={totalNote ?? 'selected range'}
          loading={!owner.data}
        />
        <StatCard
          label="Settled Claims"
          value={owner.data ? (owner.data.settledClaims == null ? '—' : formatNumber(owner.data.settledClaims)) : '—'}
          icon={<IconReceipt size={15} />}
          iconColor="var(--gold)"
          sub={settledNote ?? `in ${range}`}
          loading={!owner.data}
        />
      </div>

      <RewardsOverTimeCard />

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'suppliers' && <OwnerSuppliersTab />}
      {tab === 'issuances' && <RewardIssuancesTab />}
    </>
  );
}
