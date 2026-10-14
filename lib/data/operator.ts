import { gqlFetch } from '@/lib/graphql';
import { toDate } from '@/lib/time';
import { UPOKT_PER_POKT } from '@/lib/config';
import { NETWORK, type RangeKey } from '@/lib/app-config';
import { rangeWindow, rangeTTL } from '@/lib/timeranges';
import {
  OPERATOR_CLAIMS_SETTLED,
  OPERATOR_CLAIM_PENALTIES,
  REWARDS_BY_ADDRESSES_SERVICE,
  OVERSERVICED_BY_ADDRESSES,
  SUPPLIER_SLASHES,
} from '@/lib/queries/analytics';
import { num, parseScalar } from './_util';
import { unwrapRange, notCovered, fillCoverage, type CoverageRange } from './coverage';
import { getRewardsWindow } from './owner';
import { fetchFleetSummary, fetchOperatorSuppliers, type SupplierListPage } from './suppliers-list';

// Re-export so existing operator-tab imports keep working.
export type { SupplierRow, SupplierListPage } from './suppliers-list';

const toPokt = (u: number) => u / UPOKT_PER_POKT;

// The Operator tool's addresses are rev-share recipients. A supplier "belongs to" an operator if any of the operator's
// addresses appears in the revShare of one of its live service configs; only Staked suppliers have live configs. The
// fleet summary, the supplier list and the slashing feed pass the addresses as the catalog's `operators`, which
// resolves exactly that set.

export interface OperatorSummary {
  supplierCount: number;
  stakedPokt: number;
  rewards24hPokt: number;
  rewards48hPokt: number;
}

/** Summary cards for the Operator tool: how many suppliers pay these rev-share addresses + their
 *  combined stake, plus the trailing-24h/48h rewards paid to the addresses. */
export async function getOperatorSummary(addresses: string[]): Promise<OperatorSummary> {
  const [fleet, r24, r48] = await Promise.all([
    fetchFleetSummary({ operators: addresses }, 1800),
    getRewardsWindow(addresses, 24 * 3600),
    getRewardsWindow(addresses, 48 * 3600),
  ]);
  return {
    supplierCount: fleet.supplierCount,
    stakedPokt: toPokt(fleet.stakeUpokt),
    rewards24hPokt: r24,
    rewards48hPokt: r48,
  };
}

// ── Suppliers list ──
export async function getOperatorSuppliers(addresses: string[], after: string | null, pageSize = 25): Promise<SupplierListPage> {
  return fetchOperatorSuppliers(addresses, after, pageSize);
}

// ── Claim / Proof comparison ──
interface SettledBucketRaw {
  bucket_start: string;
  settled_claims: number | string | null;
}

interface PenaltyBucketRaw {
  bucket_start: string;
  kind: string;
  events: number | string | null;
}

export interface ClaimProofPoint {
  date: string;
  claims: number | null;
  proofs: number | null;
  expired: number | null;
}

export interface ClaimProofs {
  points: ClaimProofPoint[];
  range: CoverageRange | null;
}

/** Claims per bucket of the suppliers that share revenue with the addresses now, by the block the chain closed them in,
 *  from the settlement catalog: `proofs` the settled ones, `expired` the expired ones, `claims` every one closed
 *  (settled, expired or discarded). A bucket with nothing covered is null, never 0. */
export async function getOperatorClaimProofs(addresses: string[], range: RangeKey): Promise<ClaimProofs> {
  const w = rangeWindow(range);
  const vars = { operators: addresses, start: w.startISO, end: w.endISO, bucket: w.interval };
  const opts = { revalidate: rangeTTL(range) };
  const [earned, penalized] = await Promise.all([
    gqlFetch<{ getSupplierEarningsJson: unknown }>(NETWORK, OPERATOR_CLAIMS_SETTLED, vars, opts),
    gqlFetch<{ getSupplierPenaltiesJson: unknown }>(NETWORK, OPERATOR_CLAIM_PENALTIES, vars, opts),
  ]);
  const settled = unwrapRange<SettledBucketRaw[]>(parseScalar(earned.getSupplierEarningsJson), false);
  const penalties = unwrapRange<PenaltyBucketRaw[]>(parseScalar(penalized.getSupplierPenaltiesJson), false);
  const byDate = new Map<string, { date: string; claims: number; proofs: number; expired: number }>();
  const at = (bucket: string) => {
    const date = toDate(bucket)?.toISOString() ?? bucket;
    let row = byDate.get(date);
    if (!row) {
      row = { date, claims: 0, proofs: 0, expired: 0 };
      byDate.set(date, row);
    }
    return row;
  };
  for (const r of settled.data ?? []) {
    const row = at(r.bucket_start);
    row.proofs += num(r.settled_claims);
    row.claims += num(r.settled_claims);
  }
  for (const r of penalties.data ?? []) {
    if (r.kind !== 'expired' && r.kind !== 'discarded') continue;
    const row = at(r.bucket_start);
    if (r.kind === 'expired') row.expired += num(r.events);
    row.claims += num(r.events);
  }
  const rows = [...byDate.keys()].sort().map((d) => byDate.get(d)!);
  return {
    points: fillCoverage(rows, ['claims', 'proofs', 'expired'], settled.range, w.interval) as unknown as ClaimProofPoint[],
    range: settled.range,
  };
}

// ── Rewards by service ──
interface RewardsServiceRaw {
  service_id: string;
  relays: number | string;
  estimated_relays: number | string;
  computed_units: number | string;
  estimated_computed_units: number | string;
  gross_rewards: number | string;
  net_rewards: number | string;
}

export interface ServiceRewardRow {
  serviceId: string;
  relays: number;
  computedUnits: number;
  grossPokt: number;
  netPokt: number;
}

export interface ServiceRewards {
  rows: ServiceRewardRow[];
  range: CoverageRange | null;
}

/** Rewards per service paid to the addresses in the range, read from the settlement tables (the legacy_ resolver: the
 *  getRewardsByAddressesAndTimeGroupByService JSON, each claim counted once). */
export async function getOperatorRewardsByService(addresses: string[], range: RangeKey): Promise<ServiceRewards> {
  const w = rangeWindow(range);
  const data = await gqlFetch<{ legacyRewardsByAddressesAndTimeGroupByService: unknown }>(
    NETWORK,
    REWARDS_BY_ADDRESSES_SERVICE,
    { addresses, start: w.startISO, end: w.endISO },
    { revalidate: rangeTTL(range) },
  );
  const { data: raw, range: covered } = unwrapRange<RewardsServiceRaw[]>(parseScalar(data.legacyRewardsByAddressesAndTimeGroupByService), true);
  const rows = (raw ?? [])
    .map((r) => ({
      serviceId: r.service_id,
      relays: num(r.relays),
      computedUnits: num(r.computed_units),
      grossPokt: toPokt(num(r.gross_rewards)),
      netPokt: toPokt(num(r.net_rewards)),
    }))
    .sort((a, b) => b.grossPokt - a.grossPokt);
  return { rows, range: covered };
}

// ── Overserviced (expected vs effective burn) ──
interface OverservicedRaw {
  date_truncated: string;
  expected_burn: number | string;
  effective_burn: number | string;
}

export interface OverservicedPoint {
  date: string;
  expectedPokt: number;
  effectivePokt: number;
}

export async function getOperatorOverserviced(addresses: string[], range: RangeKey): Promise<OverservicedPoint[]> {
  const w = rangeWindow(range);
  const data = await gqlFetch<{ getOverservicedByAddressesAndTime: unknown }>(
    NETWORK,
    OVERSERVICED_BY_ADDRESSES,
    { addresses, start: w.startISO, end: w.endISO, interval: w.interval },
    { revalidate: rangeTTL(range) },
  );
  return parseScalar<OverservicedRaw[]>(data.getOverservicedByAddressesAndTime)
    .map((r) => ({
      date: toDate(r.date_truncated)?.toISOString() ?? r.date_truncated,
      expectedPokt: toPokt(num(r.expected_burn)),
      effectivePokt: toPokt(num(r.effective_burn)),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ── Slashing ──
interface SlashRaw {
  height: string | number;
  id: string;
  actorId: string;
  penaltyUpokt: string | number;
  previousStakeUpokt: string | number;
  stakeUpokt: string | number;
  proofValidationStatus: string | null;
  serviceId: string | null;
  applicationId: string | null;
}

interface SlashTotalRaw {
  kind: string;
  events: string | number | null;
  slashed_upokt: string | null;
}

export interface SlashRow {
  supplier: string;
  block: number;
  penaltyUpokt: number;
  prevStakeUpokt: number;
  afterStakeUpokt: number;
  proofStatus: string | null;
  serviceId: string | null;
  applicationId: string | null;
}

export interface SlashPage {
  rows: SlashRow[];
  /** Slashing events in the range, and the sum of their penalties (exact, as a decimal string). */
  totalCount: number;
  penaltyUpokt: string;
  /** False when the indexer covers nothing of the range yet: not indexed, which is not the same as no slashing. */
  indexed: boolean;
  /** The part of the range the totals cover (the settlement tables can lag the indexed blocks the rows come from). */
  range?: CoverageRange | null;
  /** More rows follow this page; pass endCursor as `after` to read them (`height:id` of its last row). */
  hasNextPage?: boolean;
  endCursor?: string | null;
}

/** The operator's suppliers' slashing events in a range, newest first: the first page, or the rows after `after` (the
 *  endCursor of the page before), with the range's count and penalty sum. */
export async function getOperatorSlashes(addresses: string[], range: RangeKey, pageSize = 25, after: string | null = null): Promise<SlashPage> {
  const w = rangeWindow(range);
  const cut = after ? after.indexOf(':') : -1;
  // one row past the page tells whether another page follows; the catalog returns at most 1000 rows a call, so a page
  // of 1000 that comes back full may be followed by an empty one
  const rowLimit = Math.min(pageSize + 1, 1000);
  const data = await gqlFetch<{ getActorLifecycleList: SlashRaw[] | null; getSupplierPenaltiesJson: unknown }>(
    NETWORK,
    SUPPLIER_SLASHES,
    {
      operators: addresses,
      start: w.startISO,
      end: w.endISO,
      rowLimit,
      beforeHeight: cut > 0 ? after!.slice(0, cut) : null,
      beforeId: cut > 0 ? after!.slice(cut + 1) : null,
    },
    { revalidate: 300 },
  );
  const t = unwrapRange<SlashTotalRaw[]>(parseScalar(data.getSupplierPenaltiesJson), false);
  if (notCovered(t.range)) return { rows: [], totalCount: 0, penaltyUpokt: '0', indexed: false, range: t.range };
  // one row per reason (PROOF_MISSING, PROOF_INVALID)
  const slashed = (t.data ?? []).filter((r) => r.kind === 'slashed');
  const all = data.getActorLifecycleList ?? [];
  const nodes = all.slice(0, pageSize);
  const last = nodes[nodes.length - 1];
  return {
    totalCount: slashed.reduce((s, r) => s + num(r.events), 0),
    penaltyUpokt: slashed.reduce((s, r) => s + BigInt(r.slashed_upokt ?? '0'), BigInt(0)).toString(),
    indexed: true,
    range: t.range,
    hasNextPage: all.length === rowLimit,
    endCursor: last ? `${last.height}:${last.id}` : null,
    rows: nodes.map((n) => ({
      supplier: n.actorId,
      block: num(n.height),
      penaltyUpokt: num(n.penaltyUpokt),
      prevStakeUpokt: num(n.previousStakeUpokt),
      afterStakeUpokt: num(n.stakeUpokt),
      proofStatus: n.proofValidationStatus,
      serviceId: n.serviceId,
      applicationId: n.applicationId,
    })),
  };
}
