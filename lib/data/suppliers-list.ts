import { gqlFetch } from '@/lib/graphql';
import { NETWORK } from '@/lib/app-config';
import { UPOKT_PER_POKT } from '@/lib/config';
import { SUPPLIERS_LIST, SUPPLIER_MIN_STAKE } from '@/lib/queries/analytics';
import { num } from './_util';

const toPokt = (u: number) => u / UPOKT_PER_POKT;

// Shared supplier-list fetch used by both staking tools: the Owner tool passes an ownerId filter, the
// Operator tool a rev-share filter. The caller builds the SupplierFilter; this runs the query.

interface SupplierNodeRaw {
  id: string;
  ownerId: string;
  stakeAmount: string | number;
  stakeStatus: string;
  serviceConfigs: { totalCount: number } | null;
}

export interface SupplierRow {
  operator: string;
  owner: string;
  stakePokt: number;
  status: string;
  services: number;
}

export interface SupplierListPage {
  rows: SupplierRow[];
  totalCount: number;
}

export async function fetchSuppliers(
  filter: Record<string, unknown>,
  page: number,
  pageSize: number,
  revalidate = 1800,
): Promise<SupplierListPage> {
  const data = await gqlFetch<{ suppliers: { totalCount: number; nodes: SupplierNodeRaw[] } | null }>(
    NETWORK,
    SUPPLIERS_LIST,
    { filter, first: pageSize, offset: (page - 1) * pageSize },
    { revalidate },
  );
  const d = data.suppliers;
  return {
    totalCount: d?.totalCount ?? 0,
    rows: (d?.nodes ?? []).map((n) => ({
      operator: n.id,
      owner: n.ownerId,
      stakePokt: toPokt(num(n.stakeAmount)),
      status: n.stakeStatus,
      services: n.serviceConfigs?.totalCount ?? 0,
    })),
  };
}

// ── Stake-status filtering ──
export type StakeFilter = 'all' | 'staked' | 'unstaking' | 'unstaked' | 'below_min';

export const STAKE_FILTERS: { value: StakeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'staked', label: 'Staked' },
  { value: 'unstaking', label: 'Unstaking' },
  { value: 'unstaked', label: 'Unstaked' },
  { value: 'below_min', label: 'Below Min Stake' },
];

export function isStakeFilter(v: string | null | undefined): v is StakeFilter {
  return v != null && STAKE_FILTERS.some((f) => f.value === v);
}

/** Current supplier minimum stake, in upokt (indexer `params`). Cached long — governance param. */
export async function getMinStakeUpokt(): Promise<number> {
  const data = await gqlFetch<{ params: { nodes: { value: string | null }[] } | null }>(
    NETWORK,
    SUPPLIER_MIN_STAKE,
    undefined,
    { revalidate: 6 * 3600 },
  );
  const raw = data.params?.nodes?.[0]?.value;
  if (!raw) return 0;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return num((parsed as { amount?: string | number }).amount);
  } catch {
    return 0;
  }
}

/** The SupplierFilter clause for a stake-status filter. `below_min` needs the current min stake
 *  (fetched by the caller) and means "Staked but at or under the minimum" — slash-risk nodes. */
export function statusClause(filter: StakeFilter, minStakeUpokt: number): Record<string, unknown> {
  switch (filter) {
    case 'staked':
      return { stakeStatus: { equalTo: 'Staked' } };
    case 'unstaking':
      return { stakeStatus: { equalTo: 'Unstaking' } };
    case 'unstaked':
      return { stakeStatus: { equalTo: 'Unstaked' } };
    case 'below_min':
      return { stakeStatus: { equalTo: 'Staked' }, stakeAmount: { lessThanOrEqualTo: String(minStakeUpokt) } };
    case 'all':
    default:
      return {};
  }
}
