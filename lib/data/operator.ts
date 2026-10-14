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
  height: string;
  id: string;
  actor_id: string;
  penalty_upokt: string;
  previous_stake_upokt: string;
  stake_upokt: string;
  proof_validation_status: string | null;
  service_id: string | null;
  application_id: string | null;
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

export interface SlashList {
  /** Every slashing event in the range, newest first: the view pages and the CSV exports these same rows. */
  rows: SlashRow[];
  /** How many, and the sum of their penalties (exact, as a decimal string), from these rows. */
  totalCount: number;
  penaltyUpokt: string;
  /** False when the indexer covers nothing of the range yet: not indexed, which is not the same as no slashing. */
  indexed: boolean;
  /** The part of the range the indexed blocks cover. */
  range: CoverageRange | null;
  /** False when the walk stopped at its call cap with rows left: the rows are the most recent ones only. */
  complete: boolean;
}

/** Calls of 1000 rows the walk makes at most: 20,000 slashing events in a range. */
const SLASH_WALK_MAX_CALLS = 20;
const SLASH_ROW_LIMIT = 1000;

/** Every slashing event of the operators' suppliers in a range, newest first, read in one walk (keyset on height and id,
 *  until a call comes back short), with their count and penalty sum. The caller caches the whole result. */
export async function getOperatorSlashes(addresses: string[], range: RangeKey): Promise<SlashList> {
  const w = rangeWindow(range);
  const raw: SlashRaw[] = [];
  let covered: CoverageRange | null = null;
  let before: { beforeHeight: string; beforeId: string } | null = null;
  let complete = false;
  for (let calls = 0; calls < SLASH_WALK_MAX_CALLS; calls++) {
    const data: { getActorLifecycleJson: unknown } = await gqlFetch(
      NETWORK,
      SUPPLIER_SLASHES,
      { operators: addresses, start: w.startISO, end: w.endISO, rowLimit: SLASH_ROW_LIMIT, beforeHeight: before?.beforeHeight ?? null, beforeId: before?.beforeId ?? null },
      // no per-call cache: the route caches the whole walk, one read
      { cache: 'no-store' },
    );
    const page: { data: SlashRaw[] | null; range: CoverageRange | null } = unwrapRange<SlashRaw[]>(parseScalar(data.getActorLifecycleJson), false);
    if (calls === 0) covered = page.range;
    const got: SlashRaw[] = page.data ?? [];
    raw.push(...got);
    if (got.length < SLASH_ROW_LIMIT) {
      complete = true;
      break;
    }
    const last: SlashRaw = got[got.length - 1];
    before = { beforeHeight: last.height, beforeId: last.id };
  }
  if (notCovered(covered)) return { rows: [], totalCount: 0, penaltyUpokt: '0', indexed: false, range: covered, complete: true };
  return {
    totalCount: raw.length,
    penaltyUpokt: raw.reduce((s, r) => s + BigInt(r.penalty_upokt ?? '0'), BigInt(0)).toString(),
    indexed: true,
    range: covered,
    complete,
    rows: raw.map((n) => ({
      supplier: n.actor_id,
      block: num(n.height),
      penaltyUpokt: num(n.penalty_upokt),
      prevStakeUpokt: num(n.previous_stake_upokt),
      afterStakeUpokt: num(n.stake_upokt),
      proofStatus: n.proof_validation_status,
      serviceId: n.service_id,
      applicationId: n.application_id,
    })),
  };
}
