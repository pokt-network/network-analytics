import type { Metadata } from 'next';
import { OwnerStakingView } from '@/components/owner/OwnerStakingView';

export const metadata: Metadata = { title: 'Owner Staking' };

// Tools view. Range pills are absent from the global header (it carries its own controls).
export default function OwnerStakingPage() {
  return <OwnerStakingView />;
}
