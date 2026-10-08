'use client';

import { useState } from 'react';
import { useStakingTool } from '@/components/staking/StakingToolContext';
import { useTabData } from '@/lib/use-tab-data';
import { type SupplierListPage, type StakeFilter, STAKE_FILTERS } from '@/lib/data/suppliers-list';
import { SuppliersTable } from '@/components/staking/SuppliersTable';

// Owner's fleet of suppliers, with a stake-status filter (All / Staked / Unstaking / Unstaked /
// Below Min Stake). "Below Min Stake" flags staked nodes at or under the governance minimum.
export function OwnerSuppliersTab() {
  const { addresses } = useStakingTool();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<StakeFilter>('all');

  const addrParam = addresses.join(',');
  const resetKey = `${addrParam}|${filter}`;
  const [prevKey, setPrevKey] = useState(resetKey);
  if (prevKey !== resetKey) {
    setPrevKey(resetKey);
    setPage(1);
  }

  const d = useTabData<SupplierListPage>(
    addresses.length ? `/api/owner/suppliers?addresses=${addrParam}&page=${page}&filter=${filter}` : '',
  );

  const filterSelect = (
    <select
      value={filter}
      onChange={(e) => setFilter(e.target.value as StakeFilter)}
      aria-label="Filter by stake status"
      className="rounded-lg border bg-bg-card px-2.5 py-1.5 text-[13px] text-text-secondary outline-none transition-colors hover:text-text-primary focus:border-blue"
    >
      {STAKE_FILTERS.map((f) => (
        <option key={f.value} value={f.value}>
          {f.label}
        </option>
      ))}
    </select>
  );

  return (
    <SuppliersTable
      data={d.data}
      page={page}
      onPageChange={setPage}
      right={filterSelect}
      emptyLabel={filter === 'all' ? 'No suppliers found for these owners.' : 'No suppliers match this filter.'}
    />
  );
}
