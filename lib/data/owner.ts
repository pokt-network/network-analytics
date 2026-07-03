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
import { num, parseScalar } from './_util';

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
}

export async function getOwnerRewards(addresses: string[], range: RangeKey, groupAll: boolean): Promise<OwnerRewards> {
  const w = rangeWindow(range);
  if (groupAll) {
    const data = await gqlFetch<{ getRewardsByAddressesAndTimeGroupByDate: unknown }>(
      NETWORK,
      REWARDS_BY_DATE_GROUPED,
      { addresses, start: w.startISO, end: w.endISO, interval: w.interval },
      { revalidate: rangeTTL(range) },
    );
    const rows = parseScalar<DateRaw[]>(data.getRewardsByAddressesAndTimeGroupByDate)
      .map((r) => ({ date: toDate(r.date_truncated)?.toISOString() ?? r.date_truncated, total: toPokt(num(r.total_amount)) }))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return { rows, addresses: ['total'], grouped: true };
  }

  const data = await gqlFetch<{ getRewardsByAddressesAndTimeGroupByAddressAndDate: unknown }>(
    NETWORK,
    REWARDS_BY_ADDRESS_DATE,
    { addresses, start: w.startISO, end: w.endISO, interval: w.interval },
    { revalidate: rangeTTL(range) },
  );
  const raw = parseScalar<AddrDateRaw[]>(data.getRewardsByAddressesAndTimeGroupByAddressAndDate);
  const byDate = new Map<string, Record<string, number | string>>();
  const addrSet = new Set<string>();
  for (const r of raw) {
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
  return { rows, addresses: [...addrSet], grouped: false };
}

export async function getOwnerTotal(addresses: string[], range: RangeKey): Promise<number> {
  const w = rangeWindow(range);
  const data = await gqlFetch<{ getRewardsByAddressesAndTime: unknown }>(
    NETWORK,
    REWARDS_BY_ADDRESSES_TIME,
    { addresses, start: w.startISO, end: w.endISO },
    { revalidate: rangeTTL(range) },
  );
  return toPokt(num(data.getRewardsByAddressesAndTime)); // scalar BigFloat (upokt) as string
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
  totalCount: number;
}

export async function getOwnerIssuances(addresses: string[], page: number, pageSize = 25): Promise<IssuancePage> {
  const data = await gqlFetch<{ eventClaimSettleds: { totalCount: number; nodes: SettleRaw[] } }>(
    NETWORK,
    EVENT_CLAIM_SETTLEDS,
    { owners: addresses, first: pageSize, offset: (page - 1) * pageSize },
    { revalidate: 30 },
  );
  const d = data.eventClaimSettleds;
  return {
    totalCount: d?.totalCount ?? 0,
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
