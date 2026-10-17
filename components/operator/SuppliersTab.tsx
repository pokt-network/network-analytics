'use client';

import { useStakingTool } from '@/components/staking/StakingToolContext';
import { useCursorPages } from '@/lib/cursor-pages';
import type { SupplierListPage, SupplierRow } from '@/lib/data/suppliers-list';
import { SuppliersTable } from '@/components/staking/SuppliersTable';

// Suppliers that pay the operator's rev-share addresses, ranked by stake.
export function SuppliersTab() {
  const { addresses } = useStakingTool();
  const addrParam = addresses.join(',');
  const d = useCursorPages<SupplierListPage>(addresses.length ? `/api/operator/suppliers?addresses=${addrParam}` : '', addrParam, {
    rowKey: (r) => (r as SupplierRow).operator,
  });

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
      right={<span className="text-[12px] text-text-tertiary">ranked by stake</span>}
      emptyLabel="No suppliers found for these addresses."
    />
  );
}
