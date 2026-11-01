'use client';

import { useState } from 'react';
import { useStakingTool } from '@/components/staking/StakingToolContext';
import { useCursorPages } from '@/lib/cursor-pages';
import { type SupplierListPage, type SupplierRow, type StakeFilter, STAKE_FILTERS } from '@/lib/data/suppliers-list';
import { SuppliersTable } from '@/components/staking/SuppliersTable';

// Owner's fleet of suppliers, with a stake-status filter (All / Staked / Unstaking / Unstaked /
// Below Min Stake). "Below Min Stake" flags staked nodes at or under the governance minimum.
export function OwnerSuppliersTab() {
  const { addresses } = useStakingTool();
  const [filter, setFilter] = useState<StakeFilter>('all');

  const addrParam = addresses.join(',');
  const d = useCursorPages<SupplierListPage>(
    addresses.length ? `/api/owner/suppliers?addresses=${addrParam}&filter=${filter}` : '',
    `${addrParam}|${filter}`,
    { rowKey: (r) => (r as SupplierRow).operator },
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
      page={d.page}
      canNext={d.canNext}
      onPrev={d.prev}
      onNext={d.next}
      error={d.error}
      repeats={d.repeats}
      missed={d.missed}
      right={filterSelect}
      emptyLabel={filter === 'all' ? 'No suppliers found for these owners.' : 'No suppliers match this filter.'}
    />
  );
}
