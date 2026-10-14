import { gqlFetch } from '@/lib/graphql';
import { NETWORK } from '@/lib/app-config';
import { UPOKT_PER_POKT } from '@/lib/config';
import { OWNER_SUPPLIERS, OPERATOR_SUPPLIERS, SUPPLIER_FLEET_SUMMARY, SUPPLIER_MIN_STAKE } from '@/lib/queries/analytics';
import { num } from './_util';

const toPokt = (u: number) => u / UPOKT_PER_POKT;

// Supplier-list fetches for the staking tools: one page of a fleet from getSupplierFleetList (the Owner tool's owners,
// the Operator tool's rev-share addresses as operators), largest stake first then by id, paged by keyset, with the count
// in the same request.

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
  /** totalCount is a floor: the count stopped at its cap. */
  totalCapped?: boolean;
  /** More rows follow this page; pass endCursor as `after` to read them. */
  hasNextPage?: boolean;
  endCursor?: string | null;
}

/** The rows that follow a page's last row (its endCursor, `stake:id`) in the fleet function's order: a smaller stake, or
 *  the same stake and a larger id. Null on the first page (the indexer refuses a null filter, so it is left out). */
function keysetFilter(after: string | null): Record<string, unknown> | null {
  if (!after) return null;
  const cut = after.indexOf(':');
  if (cut <= 0) throw new Error(`supplier list: invalid cursor ${after}`);
  const [stake, id] = [after.slice(0, cut), after.slice(cut + 1)];
  return { or: [{ stakeUpokt: { lessThan: stake } }, { and: [{ stakeUpokt: { equalTo: stake } }, { supplierId: { greaterThan: id } }] }] };
}

/** A non-negative decimal string (an indexer BigFloat: `60010000000`, `1.5`, `6.001e10`) as [integer part, fraction
 *  digits], exactly, with no float on the way. */
function decimalParts(v: string | number): [bigint, string] {
  const m = String(v).trim().toLowerCase().match(/^(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/);
  if (!m) throw new Error(`supplier list: stake ${v} is not a decimal`);
  const exp = Number(m[3] ?? 0);
  const digits = `${m[1] ?? ''}${m[2] ?? ''}`;
  // the point sits after the integer digits, moved by the exponent
  const point = (m[1] ?? '').length + exp;
  const padded = point > digits.length ? digits.padEnd(point, '0') : point < 0 ? '0'.repeat(-point) + digits : digits;
  const at = Math.max(point, 0);
  return [BigInt(padded.slice(0, at) || '0'), padded.slice(at).replace(/0+$/, '')];
}

/** Compares two decimal strings exactly: negative when a < b. */
function compareDecimal(a: string | number, b: string | number): number {
  const [ai, af] = decimalParts(a);
  const [bi, bf] = decimalParts(b);
  if (ai !== bi) return ai < bi ? -1 : 1;
  const n = Math.max(af.length, bf.length);
  const [x, y] = [af.padEnd(n, '0'), bf.padEnd(n, '0')];
  return x === y ? 0 : x < y ? -1 : 1;
}

/** A page from the rows asked for (pageSize + 1: the extra one tells whether another page follows). getSupplierFleetList
 *  takes no orderBy: the keyset relies on its own ORDER BY (stake desc, then id), so a row out of that order fails the
 *  page instead of paging wrong. */
function toPage(all: FleetRowRaw[], pageSize: number, totalCount: number): SupplierListPage {
  for (let i = 1; i < all.length; i++) {
    const c = compareDecimal(all[i - 1].stakeUpokt, all[i].stakeUpokt);
    if (c < 0 || (c === 0 && all[i - 1].supplierId >= all[i].supplierId)) {
      throw new Error('supplier list: rows out of the (stake desc, id) order the paging relies on');
    }
  }
  const page = all.slice(0, pageSize);
  const last = page[page.length - 1];
  return {
    totalCount,
    hasNextPage: all.length > pageSize,
    endCursor: last ? `${last.stakeUpokt}:${last.supplierId}` : null,
    rows: page.map((r) => ({
      operator: r.supplierId,
      owner: r.ownerId ?? '',
      stakePokt: toPokt(num(r.stakeUpokt)),
      status: r.stakeStatus,
      services: num(r.serviceCount),
    })),
  };
}

/** One page of the suppliers the owners own now, with a stake-status filter (`below_min` needs the current min stake),
 *  and their count: the first page, or the one after `after` (the endCursor of the page before). */
export async function fetchOwnerSuppliers(
  owners: string[],
  filter: StakeFilter,
  minStakeUpokt: number,
  after: string | null,
  pageSize: number,
  revalidate = 1800,
): Promise<SupplierListPage> {
  const stakeStatuses = filter === 'all' ? null : filter === 'unstaking' ? ['Unstaking'] : filter === 'unstaked' ? ['Unstaked'] : ['Staked'];
  const belowMin = filter === 'below_min';
  // "below min stake" = Staked and at or under the current minimum (the slash-risk nodes)
  const ceiling = belowMin ? { stakeUpokt: { lessThanOrEqualTo: String(minStakeUpokt) } } : null;
  const conds = [keysetFilter(after), ceiling].filter((c): c is Record<string, unknown> => c !== null);
  const data = await gqlFetch<{
    rows: FleetRowRaw[] | null;
    count?: Array<{ supplierCount: string | number }> | null;
    under?: Array<{ supplierId: string }> | null;
  }>(
    NETWORK,
    OWNER_SUPPLIERS,
    {
      owners,
      stakeStatuses,
      first: pageSize + 1,
      belowMin,
      ...(ceiling ? { ceiling } : {}),
      ...(conds.length ? { after: conds.length === 1 ? conds[0] : { and: conds } } : {}),
    },
    { revalidate },
  );
  const under = data.under?.length ?? 0;
  const page = toPage(data.rows ?? [], pageSize, belowMin ? Math.min(under, 1000) : num(data.count?.[0]?.supplierCount));
  return belowMin && under > 1000 ? { ...page, totalCapped: true } : page;
}

/** One page of the Staked suppliers that share revenue with the operators now, and their count: the first page, or the
 *  one after `after` (the endCursor of the page before). */
export async function fetchOperatorSuppliers(
  operators: string[],
  after: string | null,
  pageSize: number,
  revalidate = 1800,
): Promise<SupplierListPage> {
  const keyset = keysetFilter(after);
  const data = await gqlFetch<{ rows: FleetRowRaw[] | null; fleet: Array<{ supplierCount: string | number }> | null }>(
    NETWORK,
    OPERATOR_SUPPLIERS,
    { operators, first: pageSize + 1, ...(keyset ? { after: keyset } : {}) },
    { revalidate },
  );
  return toPage(data.rows ?? [], pageSize, num(data.fleet?.[0]?.supplierCount));
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
