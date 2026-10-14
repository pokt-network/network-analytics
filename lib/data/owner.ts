import { gqlFetch } from '@/lib/graphql';
import { toDate } from '@/lib/time';
import { UPOKT_PER_POKT } from '@/lib/config';
import { NETWORK, type RangeKey } from '@/lib/app-config';
import { rangeWindow, rangeTTL, fixedWindow } from '@/lib/timeranges';
import {
  REWARDS_BY_ADDRESSES_TIME,
  REWARDS_BY_ADDRESS_DATE,
  REWARDS_BY_DATE_GROUPED,
  OWNER_CLAIMS,
  OWNER_CLAIMS_RANGE,
  OWNER_SETTLED_CLAIMS,
  SUPPLIER_OWNERS,
} from '@/lib/queries/analytics';
import { num, parseScalar } from './_util';
import { unwrapRange, notCovered, fillCoverage, type CoverageRange } from './coverage';
import { fetchFleetSummary, fetchOwnerSuppliers, getMinStakeUpokt, type StakeFilter, type SupplierListPage } from './suppliers-list';

const toPokt = (u: number) => u / UPOKT_PER_POKT;

interface AddrDateRaw {
  address: string;
  date_truncated: string;
  total_amount: number | string;
}
interface DateRaw {
  date_truncated: string;
  total_amount: number | string;
}

export interface OwnerRewards {
  rows: Array<Record<string, number | string | null>>; // {date, [addr]:pokt} — or {date, total:pokt} when grouped; null = not covered
  addresses: string[]; // addresses with rewards in the window (['total'] when grouped)
  grouped: boolean;
  range: CoverageRange | null; // what the indexer answered for (null from an indexer without the range contract)
}

export async function getOwnerRewards(addresses: string[], range: RangeKey, groupAll: boolean): Promise<OwnerRewards> {
  const w = rangeWindow(range);
  if (groupAll) {
    const data = await gqlFetch<{ legacyRewardsByAddressesAndTimeGroupByDate: unknown }>(
      NETWORK,
      REWARDS_BY_DATE_GROUPED,
      { addresses, start: w.startISO, end: w.endISO, interval: w.interval },
      { revalidate: rangeTTL(range) },
    );
    const { data: dated, range: covered } = unwrapRange<DateRaw[]>(parseScalar(data.legacyRewardsByAddressesAndTimeGroupByDate), true);
    const rows = (dated ?? [])
      .map((r) => ({ date: toDate(r.date_truncated)?.toISOString() ?? r.date_truncated, total: toPokt(num(r.total_amount)) }))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return { rows: fillCoverage(rows, ['total'], covered, w.interval), addresses: ['total'], grouped: true, range: covered };
  }

  const data = await gqlFetch<{ legacyRewardsByAddressesAndTimeGroupByAddressAndDate: unknown }>(
    NETWORK,
    REWARDS_BY_ADDRESS_DATE,
    { addresses, start: w.startISO, end: w.endISO, interval: w.interval },
    { revalidate: rangeTTL(range) },
  );
  const { data: raw, range: covered } = unwrapRange<AddrDateRaw[]>(parseScalar(data.legacyRewardsByAddressesAndTimeGroupByAddressAndDate), true);
  const byDate = new Map<string, Record<string, number | string>>();
  const addrSet = new Set<string>();
  for (const r of raw ?? []) {
    const d = toDate(r.date_truncated)?.toISOString() ?? r.date_truncated;
    addrSet.add(r.address);
    let row = byDate.get(d);
    if (!row) {
      row = { date: d };
      byDate.set(d, row);
    }
    row[r.address] = toPokt(num(r.total_amount));
  }
  const rows = [...byDate.keys()].sort().map((d) => byDate.get(d)!);
  return { rows: fillCoverage(rows, addresses, covered, w.interval), addresses: [...addrSet], grouped: false, range: covered };
}

/** Total rewards in POKT and the range it covers; `totalPokt` is null ("—", never 0) when nothing in the range is
 *  covered or the value is not a number. */
export async function getOwnerTotal(addresses: string[], range: RangeKey): Promise<{ totalPokt: number | null; range: CoverageRange | null }> {
  const w = rangeWindow(range);
  const data = await gqlFetch<{ legacyRewardsByAddressesAndTime: unknown }>(
    NETWORK,
    REWARDS_BY_ADDRESSES_TIME,
    { addresses, start: w.startISO, end: w.endISO },
    { revalidate: rangeTTL(range) },
  );
  return ownerTotal(data.legacyRewardsByAddressesAndTime);
}

/** The total field as read: upokt as a BigFloat string from an older indexer, or a JSON {range, data} from a newer
 *  one, whose data is the upokt as a decimal string (sent as a string so JSON does not round it; read as a JS number,
 *  which is exact only below 2^53) or null. */
export function ownerTotal(field: unknown): { totalPokt: number | null; range: CoverageRange | null } {
  const total = unwrapRange<unknown>(parseScalar(field), true);
  const v = typeof total.data === 'string' ? (/^-?\d+(\.\d+)?$/.test(total.data) ? Number(total.data) : null) : total.data;
  return { totalPokt: notCovered(total.range) || typeof v !== 'number' || !Number.isFinite(v) ? null : toPokt(v), range: total.range };
}

/** Settled claims in the range of the suppliers the owners own now (the catalog resolves owners at the latest block),
 *  from the settlement catalog; null ("—", never 0) when nothing in the range is covered. Counting the raw settlement
 *  events instead took ~15 s for a large owner. */
export async function getOwnerSettledClaims(addresses: string[], range: RangeKey): Promise<{ count: number | null; range: CoverageRange | null }> {
  const w = rangeWindow(range);
  const data = await gqlFetch<{ getSupplierEarningsJson: unknown }>(
    NETWORK,
    OWNER_SETTLED_CLAIMS,
    { owners: addresses, start: w.startISO, end: w.endISO },
    { revalidate: rangeTTL(range) },
  );
  const { data: rows, range: covered } = unwrapRange<Array<{ settled_claims: string | number }>>(parseScalar(data.getSupplierEarningsJson), false);
  if (notCovered(covered)) return { count: null, range: covered };
  return { count: (rows ?? []).reduce((s, r) => s + num(r.settled_claims), 0), range: covered };
}

/** Rewards over a fixed trailing window (e.g. 24h/48h for summary cards), independent of the selected
 *  chart range. Rev-share-recipient keyed (the legacy settlement-table resolver); shared with the
 *  Operator tool's summary cards. Returns POKT (null total → 0). */
export async function getRewardsWindow(addresses: string[], seconds: number): Promise<number> {
  const w = fixedWindow(seconds);
  const data = await gqlFetch<{ legacyRewardsByAddressesAndTime: unknown }>(
    NETWORK,
    REWARDS_BY_ADDRESSES_TIME,
    { addresses, start: w.startISO, end: w.endISO },
    { revalidate: 600 },
  );
  return ownerTotal(data.legacyRewardsByAddressesAndTime).totalPokt ?? 0;
}

export interface OwnerSummary {
  supplierCount: number;
  stakedPokt: number;
}

/** Fleet rollup for the Owner summary cards: how many suppliers each owner runs + combined stake.
 *  Owner-keyed (suppliers.ownerId). Range-independent — the reward/claims cards come from /api/owner. */
export async function getOwnerSummary(addresses: string[]): Promise<OwnerSummary> {
  const fleet = await fetchFleetSummary({ owners: addresses }, 1800);
  return { supplierCount: fleet.supplierCount, stakedPokt: toPokt(fleet.stakeUpokt) };
}

/** Owner's suppliers (fleet), filtered by stake status. `below_min` needs the live min-stake param. */
export async function getOwnerSuppliers(
  addresses: string[],
  filter: StakeFilter,
  after: string | null,
  pageSize = 25,
): Promise<SupplierListPage> {
  const minStake = filter === 'below_min' ? await getMinStakeUpokt() : 0;
  return fetchOwnerSuppliers(addresses, filter, minStake, after, pageSize);
}

interface ClaimRaw {
  height: string;
  eventIdx: number;
  serviceId: string;
  relays: string;
  settledUpokt: string;
  relayMintedUpokt: string;
  supplierId: string;
  supplierOwnerId: string | null;
  coveredFrom: string | null;
  coveredTo: string | null;
  coveredGaps: Array<{ from: string | null; to: string | null }> | null;
}

export interface Issuance {
  block: number;
  serviceId: string;
  /** Operator (node) address — the supplier that settled this claim. */
  operator: string;
  /** Owner of that supplier now (what groups a fleet), or the one the settlement recorded where the current one could
   *  not be read; '—' when neither is known. */
  owner: string;
  /** Which owner `owner` is: 'current' (now), 'settlement' (recorded at settlement) or 'unknown'. */
  ownerAsOf: 'settlement' | 'current' | 'unknown';
  /** The owner the settlement recorded ('' where it recorded none: 211 old rows on mainnet). */
  settlementOwner: string;
  relays: number;
  settledUpokt: number;
  mintedUpokt: number;
  /** Minted over settled. */
  mintRatio: number;
}

export interface IssuancePage {
  rows: Issuance[];
  hasNextPage: boolean; // more rows follow this page
  endCursor?: string | null; // pass as `after` to read the rows that follow this page
  /** The part of the history the settlement tables cover (null from an indexer without the range contract). */
  range?: CoverageRange | null;
}

/** One page of settlements, newest first: the first page, or the rows after `after` (the endCursor of the page before,
 *  `height:eventIdx`). */
export async function getOwnerIssuances(addresses: string[], pageSize = 25, after: string | null = null): Promise<IssuancePage> {
  const [beforeHeight, beforeEventIdx] = after ? after.split(':') : [null, null];
  // one row past the page tells whether another page follows; the catalog returns at most 1000 rows a call, so a page
  // of 1000 that comes back full may be followed by an empty one
  const rowLimit = Math.min(pageSize + 1, 1000);
  const data = await gqlFetch<{ getClaimsList: ClaimRaw[] | null }>(
    NETWORK,
    OWNER_CLAIMS,
    { owners: addresses, rowLimit, beforeHeight, beforeEventIdx: beforeEventIdx == null ? null : Number(beforeEventIdx) },
    { revalidate: 30 },
  );
  const all = data.getClaimsList ?? [];
  // the covered part of the history: on every row; an answer with no rows asks for it on its own
  const range: CoverageRange | null = all.length
    ? { requested_from: null, requested_to: null, covered_from: all[0].coveredFrom, covered_to: all[0].coveredTo, gaps: all[0].coveredGaps ?? [], end_inclusive: false }
    : unwrapRange<unknown>(parseScalar((await gqlFetch<{ getClaimsJson: unknown }>(NETWORK, OWNER_CLAIMS_RANGE, { owners: addresses }, { revalidate: 30 })).getClaimsJson), false).range;
  const page = all.slice(0, pageSize);
  const last = page[page.length - 1];
  // every supplier listed is owned now by one of the owners: with one owner that is the current owner, no lookup
  const current =
    addresses.length === 1
      ? new Map(page.map((n) => [n.supplierId, addresses[0]]))
      : await currentOwners([...new Set(page.map((n) => n.supplierId))]);
  return {
    range,
    endCursor: last ? `${last.height}:${last.eventIdx}` : null,
    hasNextPage: all.length === rowLimit,
    rows: page.map((n) => {
      const settled = num(n.settledUpokt);
      const minted = num(n.relayMintedUpokt);
      return {
        block: num(n.height),
        serviceId: n.serviceId,
        operator: n.supplierId,
        owner: current.get(n.supplierId) || n.supplierOwnerId || '—',
        ownerAsOf: current.get(n.supplierId) ? 'current' : n.supplierOwnerId ? 'settlement' : 'unknown',
        settlementOwner: n.supplierOwnerId ?? '',
        relays: num(n.relays),
        settledUpokt: settled,
        mintedUpokt: minted,
        mintRatio: settled > 0 ? minted / settled : 0,
      };
    }),
  };
}

/** The current owner of each supplier (a flat lookup by id). A supplier it cannot find, or a failed lookup, leaves only
 *  that cell on the settlement's owner (or unknown). */
async function currentOwners(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  try {
    const data = await gqlFetch<{ suppliers: { nodes: Array<{ id: string; ownerId: string }> } | null }>(
      NETWORK,
      SUPPLIER_OWNERS,
      { ids, first: ids.length },
      { revalidate: 1800 },
    );
    const owners = new Map((data.suppliers?.nodes ?? []).map((n) => [n.id, n.ownerId]));
    const missing = ids.filter((id) => !owners.get(id));
    if (missing.length) console.warn(`issuances: no current owner for ${missing.length} of ${ids.length} suppliers`);
    return owners;
  } catch (e) {
    console.warn(`issuances: current owner lookup failed: ${(e as Error).message}`);
    return new Map();
  }
}
