import { gqlFetch } from '@/lib/graphql';
import { NETWORK } from '@/lib/app-config';
import { UPOKT_PER_POKT } from '@/lib/config';
import { OWNER_SUPPLIERS, OPERATOR_SUPPLIERS, SUPPLIER_FLEET_SUMMARY, SUPPLIER_MIN_STAKE } from '@/lib/queries/analytics';
import { num } from './_util';

const toPokt = (u: number) => u / UPOKT_PER_POKT;

// Supplier-list fetches for the staking tools: one page of a fleet from getSupplierFleetList (the Owner tool's owners,
// the Operator tool's rev-share addresses as operators), largest stake first then by id, paged by keyset, with the count
// in the same request.

export interface FleetRowRaw {
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
  /** More rows follow this page; pass endCursor as `after` to read them. */
  hasNextPage?: boolean;
  endCursor?: string | null;
}

/** The fleet function's keyset after a page's last row (its endCursor, `stake:id`); none on the first page. */
function keysetArgs(after: string | null): { afterStakeUpokt?: string; afterSupplierId?: string } {
  if (!after) return {};
  const cut = after.indexOf(':');
  if (cut <= 0) throw new Error(`supplier list: invalid cursor ${after}`);
  return { afterStakeUpokt: after.slice(0, cut), afterSupplierId: after.slice(cut + 1) };
}

/** A non-negative decimal string (an indexer BigFloat: `60010000000`, `1.5`) as [integer part, fraction digits],
 *  exactly, with no float on the way. PostgreSQL prints numeric without an exponent and PostGraphile passes BigFloat on
 *  as that text, so an exponent is not expected: it fails here, as the cursor routes refuse it. */
function decimalParts(v: string | number): [bigint, string] {
  const m = String(v).trim().match(/^(\d+)(?:\.(\d*))?$/);
  if (!m) throw new Error(`supplier list: stake ${v} is not a plain decimal`);
  return [BigInt(m[1]), (m[2] ?? '').replace(/0+$/, '')];
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

/** A page from the rows asked for (pageSize + 1: the extra one tells whether another page follows). The function pages
 *  in its own order (stake desc, then id), which the keyset relies on. A supplier that is restaking can be live in two
 *  versions for a few seconds (the indexer writes the new one before the block closes the old one), so a supplier seen
 *  twice keeps its first row only, whether the second has the same stake or another; only a strict inversion of the
 *  order between two different suppliers fails the page. */
export function toPage(all: FleetRowRaw[], pageSize: number, totalCount: number): SupplierListPage {
  const seen = new Set<string>();
  const rows: FleetRowRaw[] = [];
  for (const r of all) {
    if (seen.has(r.supplierId)) continue;
    const prev = rows[rows.length - 1];
    if (prev) {
      const c = compareDecimal(prev.stakeUpokt, r.stakeUpokt);
      if (c < 0 || (c === 0 && prev.supplierId > r.supplierId)) {
        throw new Error('supplier list: rows out of the (stake desc, id) order the paging relies on');
      }
    }
    seen.add(r.supplierId);
    rows.push(r);
  }
  const page = rows.slice(0, pageSize);
  const last = page[page.length - 1];
  return {
    totalCount,
    hasNextPage: all.length > pageSize, // the raw rows: a dropped duplicate does not end the walk
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
): Promise<SupplierListPage> {
  const stakeStatuses = filter === 'all' ? null : filter === 'unstaking' ? ['Unstaking'] : filter === 'unstaked' ? ['Unstaked'] : ['Staked'];
  // "below min stake" = Staked and at or under the current minimum (the slash-risk nodes); the ceiling is exclusive and
  // stakes are whole upokt, so at or under min = below min + 1
  const ceiling = filter === 'below_min' ? { maxStakeUpokt: (BigInt(Math.trunc(minStakeUpokt)) + BigInt(1)).toString() } : {};
  const data = await gqlFetch<{ rows: FleetRowRaw[] | null; count: Array<{ supplierCount: string | number }> | null }>(
    NETWORK,
    OWNER_SUPPLIERS,
    { owners, stakeStatuses, rowLimit: pageSize + 1, ...ceiling, ...keysetArgs(after) },
    // no fetch cache: the route caches the processed page, so a page that fails to process is not kept
    { cache: 'no-store' },
  );
  return toPage(data.rows ?? [], pageSize, num(data.count?.[0]?.supplierCount));
}

/** One page of the Staked suppliers that share revenue with the operators now, and their count: the first page, or the
 *  one after `after` (the endCursor of the page before). */
export async function fetchOperatorSuppliers(
  operators: string[],
  after: string | null,
  pageSize: number,
): Promise<SupplierListPage> {
  const data = await gqlFetch<{ rows: FleetRowRaw[] | null; fleet: Array<{ supplierCount: string | number }> | null }>(
    NETWORK,
    OPERATOR_SUPPLIERS,
    { operators, rowLimit: pageSize + 1, ...keysetArgs(after) },
    // no fetch cache: the route caches the processed page, so a page that fails to process is not kept
    { cache: 'no-store' },
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
