import { gqlFetch } from '@/lib/graphql';
import { NETWORK } from '@/lib/app-config';
import { UPOKT_PER_POKT } from '@/lib/config';
import { SUPPLIERS_LIST, SUPPLIER_SERVICE_COUNTS, OPERATOR_SUPPLIERS, SUPPLIER_FLEET_SUMMARY, SUPPLIER_MIN_STAKE } from '@/lib/queries/analytics';
import { num } from './_util';

const toPokt = (u: number) => u / UPOKT_PER_POKT;

// Supplier-list fetches for the staking tools: the Owner tool passes an ownerId filter (built by the caller) to the
// suppliers list, the Operator tool its rev-share addresses to the fleet function.

interface SupplierNodeRaw {
  id: string;
  ownerId: string;
  stakeAmount: string | number;
  stakeStatus: string;
}

interface FleetRowRaw {
  supplierId: string;
  ownerId: string | null;
  stakeUpokt: string | number;
  stakeStatus: string;
  serviceCount: string | number | null;
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
  const nodes = d?.nodes ?? [];
  const services = await serviceCounts(nodes.map((n) => n.id), revalidate);
  return {
    totalCount: d?.totalCount ?? 0,
    rows: nodes.map((n) => ({
      operator: n.id,
      owner: n.ownerId,
      stakePokt: toPokt(num(n.stakeAmount)),
      status: n.stakeStatus,
      services: services.get(n.id) ?? 0,
    })),
  };
}

/** The services each supplier has a live config for (at most 200 suppliers), from the fleet function. Every supplier
 *  asked about exists now, so a missing one is an error, not a supplier with no services. */
async function serviceCounts(ids: string[], revalidate: number): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const data = await gqlFetch<{ getSupplierFleetList: Array<Pick<FleetRowRaw, 'supplierId' | 'serviceCount'>> | null }>(
    NETWORK,
    SUPPLIER_SERVICE_COUNTS,
    { suppliers: ids },
    { revalidate },
  );
  const counts = new Map((data.getSupplierFleetList ?? []).map((r) => [r.supplierId, num(r.serviceCount)]));
  const missing = ids.filter((id) => !counts.has(id));
  if (missing.length) throw new Error(`service counts: ${missing.length} of ${ids.length} suppliers missing from the fleet answer`);
  return counts;
}

/** One page of the Staked suppliers that share revenue with the operators now, largest stake first, and their count. */
export async function fetchOperatorSuppliers(
  operators: string[],
  page: number,
  pageSize: number,
  revalidate = 1800,
): Promise<SupplierListPage> {
  const data = await gqlFetch<{ rows: FleetRowRaw[] | null; fleet: Array<{ supplierCount: string | number }> | null }>(
    NETWORK,
    OPERATOR_SUPPLIERS,
    { operators, first: pageSize, offset: (page - 1) * pageSize },
    { revalidate },
  );
  return {
    totalCount: num(data.fleet?.[0]?.supplierCount),
    rows: (data.rows ?? []).map((r) => ({
      operator: r.supplierId,
      owner: r.ownerId ?? '',
      stakePokt: toPokt(num(r.stakeUpokt)),
      status: r.stakeStatus,
      services: num(r.serviceCount),
    })),
  };
}

/** A fleet's supplier count and combined stake (upokt), for owners or operators. */
export async function fetchFleetSummary(
  scope: { owners: string[] } | { operators: string[] },
  revalidate = 1800,
): Promise<{ supplierCount: number; stakeUpokt: number }> {
  const data = await gqlFetch<{ getSupplierFleetList: Array<{ supplierCount: string | number; stakeUpokt: string | number }> | null }>(
    NETWORK,
    SUPPLIER_FLEET_SUMMARY,
    scope,
    { revalidate },
  );
  const r = data.getSupplierFleetList?.[0];
  return { supplierCount: num(r?.supplierCount), stakeUpokt: num(r?.stakeUpokt) };
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
