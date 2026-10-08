import type { Metadata } from 'next';
import { OperatorStakingView } from '@/components/operator/OperatorStakingView';

export const metadata: Metadata = { title: 'Operator Staking' };

// Tools view. Range pills live in the view's own cards (not the global header).
export default function OperatorStakingPage() {
  return <OperatorStakingView />;
}
