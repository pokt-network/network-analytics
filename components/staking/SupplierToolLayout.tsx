'use client';

import type { ReactNode } from 'react';
import { ManageAddresses } from './ManageAddresses';
import { useStakingTool } from './StakingToolContext';
import { EmptyState } from '@/components/ui/states';

// Shared chrome for the staking tools: a heading, the address manager, then either the empty state
// (no addresses) or the tool body. Both Owner and Operator views render their summary + charts as
// `children`; the body reads the tracked addresses/range from useStakingTool().
export function SupplierToolLayout({
  title,
  description,
  icon,
  actionLabel,
  placeholder,
  emptyState,
  children,
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  actionLabel?: string;
  placeholder?: string;
  emptyState?: ReactNode;
  children: ReactNode;
}) {
  const { addresses, hydrated } = useStakingTool();
  const showEmpty = hydrated && addresses.length === 0;

  return (
    <>
      <div className="mb-[18px] flex items-center gap-2.5">
        {icon}
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.2px]">{title}</h1>
          <p className="text-[15px] text-text-secondary">{description}</p>
        </div>
      </div>

      <ManageAddresses actionLabel={actionLabel} placeholder={placeholder} />

      {showEmpty
        ? (emptyState ?? (
            <EmptyState>
              Add one or more <span className="font-mono">pokt1…</span> addresses to begin.
            </EmptyState>
          ))
        : addresses.length > 0 && children}
    </>
  );
}
