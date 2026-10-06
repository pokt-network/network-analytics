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
} from '@/lib/queries/analytics';
import { num, parseScalar, unwrapRange, type CoverageRange } from './_util';

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
  rows: Array<Record<string, number | string>>; // {date, [addr]:pokt} — or {date, total:pokt} when grouped
  addresses: string[]; // series keys present (['total'] when grouped)
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
    const { data: dated, range: covered } = unwrapRange<DateRaw[]>(parseScalar(data.legacyRewardsByAddressesAndTimeGroupByDate));
    const rows = (dated ?? [])
      .map((r) => ({ date: toDate(r.date_truncated)?.toISOString() ?? r.date_truncated, total: toPokt(num(r.total_amount)) }))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return { rows, addresses: ['total'], grouped: true, range: covered };
  }

  const data = await gqlFetch<{ legacyRewardsByAddressesAndTimeGroupByAddressAndDate: unknown }>(
    NETWORK,
    REWARDS_BY_ADDRESS_DATE,
    { addresses, start: w.startISO, end: w.endISO, interval: w.interval },
    { revalidate: rangeTTL(range) },
  );
  const { data: raw, range: covered } = unwrapRange<AddrDateRaw[]>(parseScalar(data.legacyRewardsByAddressesAndTimeGroupByAddressAndDate));
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
  return { rows, addresses: [...addrSet], grouped: false, range: covered };
}

/** Total rewards in POKT; null when nothing in the range is covered (no data, not 0). Same window as getOwnerRewards,
 *  so its `range` is the one shown. */
export async function getOwnerTotal(addresses: string[], range: RangeKey): Promise<number | null> {
  const w = rangeWindow(range);
  const data = await gqlFetch<{ legacyRewardsByAddressesAndTime: unknown }>(
    NETWORK,
    REWARDS_BY_ADDRESSES_TIME,
    { addresses, start: w.startISO, end: w.endISO },
    { revalidate: rangeTTL(range) },
  );
  // upokt: a BigFloat string from an older indexer, a JSON {range, data} from a newer one.
  const total = unwrapRange<number | string>(parseScalar(data.legacyRewardsByAddressesAndTime)).data;
  return total === null ? null : toPokt(num(total));
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
  endCursor?: string | null; // pass as `after` to read the rows that follow this page
}

/** One page of settlements, newest first: by page number (offset), or the rows after `after` (a cursor). */
export async function getOwnerIssuances(
  addresses: string[],
  page: number,
  pageSize = 25,
  withCount = true,
  after: string | null = null,
): Promise<IssuancePage> {
  const data = await gqlFetch<{ eventClaimSettleds: { totalCount?: number; pageInfo: { endCursor: string | null }; nodes: SettleRaw[] } }>(
    NETWORK,
    EVENT_CLAIM_SETTLEDS,
    { owners: addresses, first: pageSize, offset: after ? null : (page - 1) * pageSize, after, withCount },
    { revalidate: 30 },
  );
  const d = data.eventClaimSettleds;
  return {
    totalCount: withCount ? (d?.totalCount ?? 0) : undefined,
    endCursor: d?.pageInfo?.endCursor ?? null,
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
