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
  const [cursors, setCursors] = useState<string[]>([]); // cursors[i]: the endCursor page i + 2 starts after

  const addrParam = addresses.join(',');
  const [prevAddr, setPrevAddr] = useState(addrParam);
  if (prevAddr !== addrParam) {
    setPrevAddr(addrParam);
    setPage(1);
    setCursors([]);
  }

  const pageAfter = page > 1 ? `&after=${encodeURIComponent(cursors[page - 2] ?? '')}` : '';
  const d = useTabData<SupplierListPage>(addresses.length ? `/api/operator/suppliers?addresses=${addrParam}${pageAfter}` : '');
  const onPageChange = (p: number) => {
    if (p > page) setCursors((c) => [...c.slice(0, page - 1), d.data?.endCursor ?? '']);
    setPage(p);
  };

  return (
    <SuppliersTable
      data={d.data}
      page={page}
      onPageChange={onPageChange}
      right={<span className="text-[12px] text-text-tertiary">ranked by stake</span>}
      emptyLabel="No suppliers found for these addresses."
    />
  );
}
