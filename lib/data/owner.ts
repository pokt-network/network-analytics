import { gqlFetch } from '@/lib/graphql';
import { toDate } from '@/lib/time';
import { UPOKT_PER_POKT } from '@/lib/config';
import { NETWORK, type RangeKey } from '@/lib/app-config';
import { rangeTTL } from '@/lib/timeranges';
import { getLastSettlement, settledWindow, type Settlement } from './settlement';
import {
  REWARDS_BY_ADDRESSES_TIME,
  REWARDS_BY_ADDRESS_DATE,
  REWARDS_BY_DATE_GROUPED,
  OWNER_CLAIMS,
  OWNER_CLAIMS_PAGE,
  OWNER_SETTLED_CLAIMS,
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

export async function getOwnerRewards(addresses: string[], range: RangeKey, groupAll: boolean, settlement?: Settlement | null): Promise<OwnerRewards> {
  const w = settledWindow(range, settlement === undefined ? await getLastSettlement() : settlement, true);
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
export async function getOwnerTotal(addresses: string[], range: RangeKey, settlement?: Settlement | null): Promise<{ totalPokt: number | null; range: CoverageRange | null }> {
  const w = settledWindow(range, settlement === undefined ? await getLastSettlement() : settlement, true);
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
export async function getOwnerSettledClaims(addresses: string[], range: RangeKey, settlement?: Settlement | null): Promise<{ count: number | null; range: CoverageRange | null }> {
  const w = settledWindow(range, settlement === undefined ? await getLastSettlement() : settlement, false);
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
export async function getRewardsWindow(addresses: string[], seconds: number, settlement?: Settlement | null): Promise<number> {
  const w = settledWindow(seconds, settlement === undefined ? await getLastSettlement() : settlement, true);
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
  minStakeUpokt?: number,
): Promise<SupplierListPage> {
  // the caller may read the min stake itself (the route does, outside its result cache, where the param's own 6 h fetch
  // cache applies)
  const minStake = filter !== 'below_min' ? 0 : (minStakeUpokt ?? (await getMinStakeUpokt()));
  return fetchOwnerSuppliers(addresses, filter, minStake, after, pageSize);
}

/** A claim as the pager's JSON page sends it (snake-case keys, numbers as strings). */
interface ClaimJsonRaw {
  height: string;
  event_idx: string;
  service_id: string;
  relays: string;
  settled_upokt: string;
  relay_minted_upokt: string;
  supplier_id: string;
  supplier_owner_id: string | null;
  current_owner_id: string | null;
}

/** A claim as the export's list page sends it. */
interface ClaimListRaw {
  height: string;
  eventIdx: number;
  serviceId: string;
  relays: string;
  settledUpokt: string;
  relayMintedUpokt: string;
  supplierId: string;
  supplierOwnerId: string | null;
  currentOwnerId: string | null;
}

export interface Issuance {
  block: number;
  serviceId: string;
  /** Operator (node) address — the supplier that settled this claim. */
  operator: string;
  /** Owner of that supplier now (what groups a fleet), or the one the settlement recorded where the current one could
   *  not be read; empty when neither is known. */
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
 *  `height:eventIdx`). `lookahead` (the pager) reads one row past the page to tell whether another follows; without it
 *  (the export walk) a full page says another may follow and a short one ends the walk, so 1000-row pages need no extra
 *  call. */
export async function getOwnerIssuances(
  addresses: string[],
  pageSize = 25,
  after: string | null = null,
  lookahead = true,
): Promise<IssuancePage> {
  if (after && !/^\d+:\d+$/.test(after)) throw new Error(`issuances: invalid cursor ${after}`);
  const [beforeHeight, beforeEventIdx] = after ? after.split(':') : [null, null];
  // the catalog returns at most 1000 rows a call
  const rowLimit = Math.min(lookahead ? pageSize + 1 : pageSize, 1000);
  const vars = { owners: addresses, rowLimit, beforeHeight, beforeEventIdx: beforeEventIdx == null ? null : Number(beforeEventIdx) };
  let range: CoverageRange | null = null;
  let all: ClaimListRaw[];
  if (lookahead) {
    // the pager: the JSON twin, whose range comes even with no rows (one request a page)
    // no fetch cache (it would keep a 200 that carries `errors`): the route caches the validated page
    const data = await gqlFetch<{ getClaimsJson: unknown }>(NETWORK, OWNER_CLAIMS_PAGE, vars, { cache: 'no-store' });
    const page = unwrapRange<ClaimJsonRaw[]>(parseScalar(data.getClaimsJson), false);
    range = page.range;
    all = (page.data ?? []).map((n) => ({
      height: n.height,
      eventIdx: num(n.event_idx),
      serviceId: n.service_id,
      relays: n.relays,
      settledUpokt: n.settled_upokt,
      relayMintedUpokt: n.relay_minted_upokt,
      supplierId: n.supplier_id,
      supplierOwnerId: n.supplier_owner_id,
      currentOwnerId: n.current_owner_id,
    }));
  } else {
    // the export: the list with only the fields it writes
    all = (await gqlFetch<{ getClaimsList: ClaimListRaw[] | null }>(NETWORK, OWNER_CLAIMS, vars, { cache: 'no-store' })).getClaimsList ?? [];
  }
  const page = all.slice(0, pageSize);
  const last = page[page.length - 1];
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
        // empty when neither owner is known; Owner As Of then says 'unknown'
        owner: n.currentOwnerId || n.supplierOwnerId || '',
        ownerAsOf: n.currentOwnerId ? 'current' : n.supplierOwnerId ? 'settlement' : 'unknown',
        settlementOwner: n.supplierOwnerId ?? '',
        relays: num(n.relays),
        settledUpokt: settled,
        mintedUpokt: minted,
        mintRatio: settled > 0 ? minted / settled : 0,
      };
    }),
  };
}
