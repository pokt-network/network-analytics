'use client';

import { useEffect, useState } from 'react';
import { IconServerBolt, IconUsers, IconCoin, IconChartLine, IconReceipt, IconChartBar, IconChartArea } from '@tabler/icons-react';
import { OWNER_ADDRESS_CAP, RANGE_KEYS, type RangeKey } from '@/lib/app-config';
import { useTabData, prefetch } from '@/lib/use-tab-data';
import type { OperatorSummary } from '@/lib/data/operator';
import { formatNumber, formatCompact } from '@/lib/format';
import { StatCard } from '@/components/ui/StatCard';
import { EmptyState } from '@/components/ui/states';
import { StakingToolProvider, useStakingTool } from '@/components/staking/StakingToolContext';
import { SupplierToolLayout } from '@/components/staking/SupplierToolLayout';
import { RewardsOverTimeCard } from '@/components/staking/RewardsOverTimeCard';
import { Tabs, type TabDef } from '@/components/staking/Tabs';
import { ClaimProofTab } from './ClaimProofTab';
import { RewardsByServiceTab } from './RewardsByServiceTab';
import { OverservicedTab } from './OverservicedTab';
import { SlashingTab } from './SlashingTab';
import { SuppliersTab } from './SuppliersTab';

const STORE_KEY = 'pnf-analytics-operator-addresses';

// Every tab reads the settlement catalog / tables (about 1 s for a 1000-supplier fleet at 60d), so the tool offers
// every range; sibling-range prefetch stays off (each range is still one indexer statement per tab).
const OPERATOR_RANGES: RangeKey[] = [...RANGE_KEYS];

// Rewards by Service is first and the default. All tabs are prefetched in parallel on mount.
const TABS: TabDef[] = [
  { key: 'rewards_by_service', label: 'Rewards by Service', icon: <IconCoin size={15} /> },
  { key: 'claim_proof', label: 'Claim / Proof', icon: <IconChartBar size={15} /> },
  { key: 'overserviced', label: 'Overserviced', icon: <IconChartArea size={15} /> },
  { key: 'slashing', label: 'Slashing', icon: <IconReceipt size={15} /> },
  { key: 'suppliers', label: 'Suppliers', icon: <IconUsers size={15} /> },
];

export function OperatorStakingView() {
  return (
    <StakingToolProvider storeKey={STORE_KEY} cap={OWNER_ADDRESS_CAP}>
      <SupplierToolLayout
        title="Operator Staking"
        description="For node runners — claim/proof, rewards by service, overservicing, and slashing across your suppliers"
        icon={<IconServerBolt size={22} className="text-blue-soft" />}
        actionLabel="View Dashboard"
        placeholder={'Paste your rev-share / node addresses (comma, space, or line separated)\npokt1…'}
        emptyState={
          <EmptyState>
            Add one or more <span className="font-mono">pokt1…</span> rev-share addresses to see claim/proof
            activity, service rewards, overservicing, and slashing for your suppliers.
          </EmptyState>
        }
      >
        <OperatorBody />
      </SupplierToolLayout>
    </StakingToolProvider>
  );
}

function OperatorBody() {
  const { addresses, range } = useStakingTool();
  const [tab, setTab] = useState('rewards_by_service');

  const addrParam = addresses.join(',');
  const summary = useTabData<OperatorSummary>(addrParam ? `/api/operator/summary?addresses=${addrParam}` : '');

  // Eagerly warm every tab's endpoint in parallel once addresses (and the range) are known. These are
  // heavy indexer aggregations (seconds each on a cold miss); firing them upfront — the same work the
  // user does by clicking through tabs, just concurrent — means a tab switch lands on a warm cache.
  // prefetch() is idempotent, so re-running on range change only warms the newly-needed range.
  useEffect(() => {
    if (!addrParam) return;
    // Range-dependent tabs.
    prefetch(`/api/operator/claim-proof?addresses=${addrParam}&range=${range}`);
    prefetch(`/api/operator/rewards-by-service?addresses=${addrParam}&range=${range}`);
    prefetch(`/api/operator/overserviced?addresses=${addrParam}&range=${range}`);
    // Page-based tabs (range-independent) — warmed once per address set.
    prefetch(`/api/operator/slashing?addresses=${addrParam}&page=1`);
    prefetch(`/api/operator/suppliers?addresses=${addrParam}&page=1`);
  }, [addrParam, range]);

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Suppliers" value={summary.data ? formatNumber(summary.data.supplierCount) : '—'} icon={<IconUsers size={15} />} iconColor="var(--lavender)" sub="paying these addresses" loading={!summary.data} />
        <StatCard label="Staked Tokens" value={summary.data ? formatCompact(summary.data.stakedPokt) : '—'} unit="POKT" icon={<IconCoin size={15} />} iconColor="var(--mint)" loading={!summary.data} />
        <StatCard label="Rewards 24h" value={summary.data ? formatCompact(summary.data.rewards24hPokt) : '—'} unit="POKT" icon={<IconChartLine size={15} />} iconColor="var(--blue-soft)" loading={!summary.data} />
        <StatCard label="Rewards 48h" value={summary.data ? formatCompact(summary.data.rewards48hPokt) : '—'} unit="POKT" icon={<IconReceipt size={15} />} iconColor="var(--gold)" loading={!summary.data} />
      </div>

      <RewardsOverTimeCard ranges={OPERATOR_RANGES} prefetchSiblings={false} />

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'claim_proof' && <ClaimProofTab />}
      {tab === 'rewards_by_service' && <RewardsByServiceTab />}
      {tab === 'overserviced' && <OverservicedTab />}
      {tab === 'slashing' && <SlashingTab />}
      {tab === 'suppliers' && <SuppliersTab />}
    </>
  );
}
