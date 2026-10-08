'use client';

import { useState } from 'react';
import { useStakingTool } from '@/components/staking/StakingToolContext';
import { useTabData } from '@/lib/use-tab-data';
import type { SupplierListPage } from '@/lib/data/suppliers-list';
import { SuppliersTable } from '@/components/staking/SuppliersTable';

// Suppliers that pay the operator's rev-share addresses, ranked by stake.
export function SuppliersTab() {
  const { addresses } = useStakingTool();
  const [page, setPage] = useState(1);

  const addrParam = addresses.join(',');
  const [prevAddr, setPrevAddr] = useState(addrParam);
  if (prevAddr !== addrParam) {
    setPrevAddr(addrParam);
    setPage(1);
  }

  const d = useTabData<SupplierListPage>(addresses.length ? `/api/operator/suppliers?addresses=${addrParam}&page=${page}` : '');

  return (
    <SuppliersTable
      data={d.data}
      page={page}
      onPageChange={setPage}
      right={<span className="text-[12px] text-text-tertiary">ranked by stake</span>}
      emptyLabel="No suppliers found for these addresses."
    />
  );
}
