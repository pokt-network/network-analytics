import { gqlFetch } from '@/lib/graphql';
import { toDate } from '@/lib/time';
import { UPOKT_PER_POKT } from '@/lib/config';
import { NETWORK, type RangeKey } from '@/lib/app-config';
import { rangeWindow, rangeTTL } from '@/lib/timeranges';
import {
  REWARDS_BY_ADDRESSES_TIME,
  REWARDS_BY_ADDRESS_DATE,
  REWARDS_BY_DATE_GROUPED,
  EVENT_CLAIM_SETTLEDS,
  OWNER_SETTLED_CLAIMS,
} from '@/lib/queries/analytics';
import { num, parseScalar } from './_util';
import { unwrapRange, notCovered, fillCoverage, type CoverageRange } from './coverage';

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

interface SettleRaw {
  serviceId: string;
  numRelays: string | number;
  settledAmount: string | number;
  mintedAmount: string | number;
  mintRatio: string | number;
  transactionId: string | null;
  blockId: string | number;
  supplierOwnerId: string;
}

export interface Issuance {
  block: number;
  serviceId: string;
  owner: string;
  relays: number;
  settledUpokt: number;
  mintedUpokt: number;
  mintRatio: number;
  transactionId: string | null;
}

export interface IssuancePage {
  rows: Issuance[];
  totalCount?: number; // absent when the caller asked for no count
  hasNextPage: boolean; // more rows follow this page
  endCursor?: string | null; // pass as `after` to read the rows that follow this page
}

/** One page of settlements, newest first: by page number (offset), or the rows after `after` (a cursor). */
export async function getOwnerIssuances(
  addresses: string[],
  page: number,
  pageSize = 25,
  withCount = false, // a count over every settlement of the owners: ~15 s for a large one

  after: string | null = null,
): Promise<IssuancePage> {
  const data = await gqlFetch<{ eventClaimSettleds: { totalCount?: number; pageInfo: { endCursor: string | null; hasNextPage: boolean }; nodes: SettleRaw[] } }>(
    NETWORK,
    EVENT_CLAIM_SETTLEDS,
    { owners: addresses, first: pageSize, offset: after ? null : (page - 1) * pageSize, after, withCount },
    { revalidate: 30 },
  );
  const d = data.eventClaimSettleds;
  return {
    totalCount: withCount ? (d?.totalCount ?? 0) : undefined,
    endCursor: d?.pageInfo?.endCursor ?? null,
    hasNextPage: d?.pageInfo?.hasNextPage ?? false,
    rows: (d?.nodes ?? []).map((n) => ({
      block: num(n.blockId),
      serviceId: n.serviceId,
      owner: n.supplierOwnerId,
      relays: num(n.numRelays),
      settledUpokt: num(n.settledAmount),
      mintedUpokt: num(n.mintedAmount),
      mintRatio: num(n.mintRatio),
      transactionId: n.transactionId,
    })),
  };
}
