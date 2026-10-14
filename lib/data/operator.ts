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
  SUPPLIER_SLASHES_RANGE,
  SUPPLIER_SLASH_TOTALS,
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
// The operators' suppliers the tab lists: 'now' (the Staked suppliers whose live service configs share revenue with
// them: the old rev-share relation filter's set). 'ever' (every supplier that ever shared revenue, so also those slashed
// and then unstaked) costs ~9 s a call for 7 addresses against ~0.6 s (mainnet, 2026-10-14), and getSupplierPenaltiesJson
// has no scope to total it: pocketdex function needed.
const SLASH_OPERATOR_SCOPE = 'now';

interface SlashRaw {
  height: string;
  id: string;
  /** read by the totals' tail only */
  blockTime?: string;
  actorId: string;
  penaltyUpokt: string;
  previousStakeUpokt: string;
  stakeUpokt: string;
  proofValidationStatus: string | null;
  serviceId: string | null;
  applicationId: string | null;
  coveredFrom: string | null;
  coveredTo: string | null;
  coveredGaps: Array<{ from: string | null; to: string | null }> | null;
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

export interface SlashTotals {
  /** Slashing events in the range and the sum of their penalties (exact, as a decimal string). */
  totalCount: number;
  penaltyUpokt: string;
  /** True when part of the range could only be counted up to a cap: both figures are floors ("at least"). */
  capped: boolean;
}

export interface SlashPage extends SlashTotals {
  /** One page, newest first; more follow when hasNextPage (pass endCursor, `height:id`, as `after`). */
  rows: SlashRow[];
  hasNextPage: boolean;
  endCursor: string | null;
  /** False when the indexer covers nothing of the range yet: not indexed, which is not the same as no slashing. */
  indexed: boolean;
  /** The part of the range the indexed blocks cover. */
  range: CoverageRange | null;
}

const LIFECYCLE_ROW_LIMIT = 1000;
/** Calls a count over a stretch the settlement tables do not cover makes at most (5,000 events). */
const UNCOVERED_MAX_CALLS = 5;
const HOUR_MS = 3_600_000;

const slashSum = (rows: Array<Pick<SlashRaw, 'penaltyUpokt'>>) => rows.reduce((s, r) => s + BigInt(r.penaltyUpokt ?? '0'), BigInt(0));

/** Slashing events in [from, to) counted from the indexed blocks (the lifecycle rows), at most UNCOVERED_MAX_CALLS calls. */
async function countSlashes(addresses: string[], from: string, to: string): Promise<{ count: number; sum: bigint; capped: boolean }> {
  let count = 0;
  let sum = BigInt(0);
  let before: { beforeHeight: string; beforeId: string } | null = null;
  for (let calls = 0; calls < UNCOVERED_MAX_CALLS; calls++) {
    const data: { getActorLifecycleList: SlashRaw[] | null } = await gqlFetch(
      NETWORK,
      SUPPLIER_SLASHES,
      { operators: addresses, operatorScope: SLASH_OPERATOR_SCOPE, start: from, end: to, rowLimit: LIFECYCLE_ROW_LIMIT, ...before },
      { cache: 'no-store' },
    );
    const got: SlashRaw[] = data.getActorLifecycleList ?? [];
    count += got.length;
    sum += slashSum(got);
    if (got.length < LIFECYCLE_ROW_LIMIT) return { count, sum, capped: false };
    const last: SlashRaw = got[got.length - 1];
    before = { beforeHeight: last.height, beforeId: last.id };
  }
  return { count, sum, capped: true };
}

/** The range's slashing count and penalty sum: getSupplierPenaltiesJson for the part the settlement tables cover, plus
 *  the slashing events (indexed blocks) of what they do not cover yet: their lag behind the window's end (the last hour
 *  is read in the same request), and, rarely, a late start, a gap or a lag longer than an hour. The caller caches it. */
export async function getOperatorSlashTotals(addresses: string[], range: RangeKey): Promise<SlashTotals> {
  const w = rangeWindow(range);
  const endMs = Date.parse(w.endISO);
  const tailStart = new Date(Math.max(Date.parse(w.startISO), endMs - HOUR_MS)).toISOString();
  const data = await gqlFetch<{ getSupplierPenaltiesJson: unknown; tail: Array<Pick<SlashRaw, 'blockTime' | 'penaltyUpokt'>> | null }>(
    NETWORK,
    SUPPLIER_SLASH_TOTALS,
    { operators: addresses, operatorScope: SLASH_OPERATOR_SCOPE, start: w.startISO, end: w.endISO, tailStart },
    { cache: 'no-store' },
  );
  const t = unwrapRange<SlashTotalRaw[]>(parseScalar(data.getSupplierPenaltiesJson), false);
  // nothing covered: the whole window from the indexed blocks
  if (!t.range || notCovered(t.range)) {
    const all = await countSlashes(addresses, w.startISO, w.endISO);
    return { totalCount: all.count, penaltyUpokt: all.sum.toString(), capped: all.capped };
  }
  // one row per reason (PROOF_MISSING, PROOF_INVALID)
  const slashed = (t.data ?? []).filter((r) => r.kind === 'slashed');
  let count = slashed.reduce((s, r) => s + num(r.events), 0);
  let sum = slashed.reduce((s, r) => s + BigInt(r.slashed_upokt ?? '0'), BigInt(0));
  let capped = false;
  const coveredTo = Date.parse(t.range.covered_to ?? w.endISO);
  // the uncovered stretches: a late start, the gaps, the end past covered_to
  const uncovered: Array<[number, number]> = [];
  const coveredFrom = Date.parse(t.range.covered_from ?? w.startISO);
  if (coveredFrom > Date.parse(w.startISO)) uncovered.push([Date.parse(w.startISO), coveredFrom]);
  for (const g of t.range.gaps ?? []) uncovered.push([Date.parse(g.from ?? w.startISO), Date.parse(g.to ?? w.endISO)]);
  if (coveredTo < endMs) uncovered.push([coveredTo, endMs]);
  const tailFrom = Date.parse(tailStart);
  const tail = data.tail ?? [];
  for (const [a, b] of uncovered) {
    if (a >= b) continue;
    if (a >= tailFrom && tail.length < LIFECYCLE_ROW_LIMIT) {
      // inside the last hour, already read
      const rows = tail.filter((r) => Date.parse(r.blockTime ?? '') >= a && Date.parse(r.blockTime ?? '') < b);
      count += rows.length;
      sum += slashSum(rows);
    } else {
      const more = await countSlashes(addresses, new Date(a).toISOString(), new Date(b).toISOString());
      count += more.count;
      sum += more.sum;
      capped ||= more.capped;
    }
  }
  return { totalCount: count, penaltyUpokt: sum.toString(), capped };
}

/** One page of the operators' suppliers' slashing events in a range, newest first: the first page, or the rows after
 *  `after` (the endCursor of the page before, `height:id`). */
export async function getOperatorSlashPage(
  addresses: string[],
  range: RangeKey,
  pageSize: number,
  after: string | null,
): Promise<Omit<SlashPage, keyof SlashTotals>> {
  const w = rangeWindow(range);
  const cut = after ? after.indexOf(':') : -1;
  // one row past the page tells whether another page follows
  const rowLimit = Math.min(pageSize + 1, LIFECYCLE_ROW_LIMIT);
  const vars = { operators: addresses, operatorScope: SLASH_OPERATOR_SCOPE, start: w.startISO, end: w.endISO };
  const data = await gqlFetch<{ getActorLifecycleList: SlashRaw[] | null }>(
    NETWORK,
    SUPPLIER_SLASHES,
    {
      operators: addresses,
      operatorScope: SLASH_OPERATOR_SCOPE,
      start: w.startISO,
      end: w.endISO,
      rowLimit,
      beforeHeight: cut > 0 ? after!.slice(0, cut) : null,
      beforeId: cut > 0 ? after!.slice(cut + 1) : null,
    },
    { revalidate: 300 },
  );
  const all = data.getActorLifecycleList ?? [];
  // the covered part of the window: on every row; a page with no rows asks for it on its own
  const covered: CoverageRange | null = all.length
    ? { requested_from: w.startISO, requested_to: w.endISO, covered_from: all[0].coveredFrom, covered_to: all[0].coveredTo, gaps: all[0].coveredGaps ?? [], end_inclusive: false }
    : unwrapRange<unknown>(parseScalar((await gqlFetch<{ getActorLifecycleJson: unknown }>(NETWORK, SUPPLIER_SLASHES_RANGE, vars, { revalidate: 300 })).getActorLifecycleJson), false).range;
  const nodes = all.slice(0, pageSize);
  const last = nodes[nodes.length - 1];
  return {
    indexed: !notCovered(covered),
    range: covered,
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
