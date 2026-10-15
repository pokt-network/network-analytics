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
  SUPPLIER_SLASH_PAGE,
  SUPPLIER_SLASH_TOTALS,
} from '@/lib/queries/analytics';
import { num, parseScalar } from './_util';
import { unwrapRange, notCovered, uncoveredSpansMicros, toMicros, microsToIso, fillCoverage, type CoverageRange } from './coverage';
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
// and then unstaked) costs ~9 s a call for 7 addresses against ~0.6 s (mainnet, 2026-10-14): pocketdex is making it
// cheaper. The totals (getSupplierPenaltiesJson) and the rows (getActorLifecycleList) both take this scope, so they
// always resolve `operators` to the same set.
const SLASH_OPERATOR_SCOPE = 'now';

/** A slashing event as the export's list page sends it. */
interface SlashRaw {
  height: string;
  id: string;
  blockTime: string | null;
  actorId: string;
  penaltyUpokt: string;
  previousStakeUpokt: string;
  stakeUpokt: string;
  proofValidationStatus: string | null;
  serviceId: string | null;
  applicationId: string | null;
}

/** A slashing event as the JSON twin sends it (the pager's page and the totals' tail): snake-case, numbers as strings. */
interface SlashJsonRaw {
  height: string;
  id: string;
  block_time: string | null;
  actor_id: string;
  penalty_upokt: string;
  previous_stake_upokt: string;
  stake_upokt: string;
  proof_validation_status: string | null;
  service_id: string | null;
  application_id: string | null;
}

const fromJson = (n: SlashJsonRaw): SlashRaw => ({
  height: n.height,
  id: n.id,
  blockTime: n.block_time,
  actorId: n.actor_id,
  penaltyUpokt: n.penalty_upokt,
  previousStakeUpokt: n.previous_stake_upokt,
  stakeUpokt: n.stake_upokt,
  proofValidationStatus: n.proof_validation_status,
  serviceId: n.service_id,
  applicationId: n.application_id,
});

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
const HOUR_MS = 3_600_000;
/** How far the indexed blocks may trail the window's end before the totals stop being complete: about a few blocks. */
const INDEX_LAG_SLACK_MS = 5 * 60_000;

const slashSum = (rows: Array<Pick<SlashRaw, 'penaltyUpokt'>>) => rows.reduce((s, r) => s + BigInt(r.penaltyUpokt ?? '0'), BigInt(0));

/** The slashing events of [from, to) from the indexed blocks, in ONE call of at most 1000 rows, newest first: `capped`
 *  when the call came back full (older events of the stretch were not read). */
async function slashesIn(addresses: string[], from: string, to: string): Promise<{ rows: SlashRaw[]; capped: boolean }> {
  const data: { getActorLifecycleList: SlashRaw[] | null } = await gqlFetch(
    NETWORK,
    SUPPLIER_SLASHES,
    { operators: addresses, operatorScope: SLASH_OPERATOR_SCOPE, start: from, end: to, rowLimit: LIFECYCLE_ROW_LIMIT },
    { cache: 'no-store' },
  );
  const rows = data.getActorLifecycleList ?? [];
  return { rows, capped: rows.length >= LIFECYCLE_ROW_LIMIT };
}

/** The range's slashing count and penalty sum: getSupplierPenaltiesJson for the part the settlement tables cover, plus
 *  the slashing events (indexed blocks) of what they do not cover yet. Request count is bounded: one request (the
 *  totals and the window's last hour of events), plus at most ONE more when a stretch the settlement tables do not cover
 *  starts before that hour (a late start, a gap, a lag over an hour; none on mainnet on 2026-10-15). The figures are
 *  floors ("at least", `capped`) when a read came back full, an event has no time, or the indexed blocks trail the
 *  window's end by more than a few blocks. The caller caches it. */
export async function getOperatorSlashTotals(addresses: string[], range: RangeKey, now?: number): Promise<SlashTotals> {
  // `now`: the instant the window ends at (the caller's cache key holds the same one)
  const w = rangeWindow(range, now);
  // every time in µs: covered_to is a block's time + 1 µs, which milliseconds would round onto the block (counted twice)
  const us = (iso: string | null | undefined) => toMicros(iso);
  const start = us(w.startISO)!;
  const end = us(w.endISO)!;
  const hourUs = BigInt(HOUR_MS) * BigInt(1000);
  const tailFrom = end - hourUs > start ? end - hourUs : start;
  const data = await gqlFetch<{ getSupplierPenaltiesJson: unknown; tail: unknown }>(
    NETWORK,
    SUPPLIER_SLASH_TOTALS,
    { operators: addresses, operatorScope: SLASH_OPERATOR_SCOPE, start: w.startISO, end: w.endISO, tailStart: microsToIso(tailFrom) },
    { cache: 'no-store' },
  );
  const t = unwrapRange<SlashTotalRaw[]>(parseScalar(data.getSupplierPenaltiesJson), false);
  const tailPage = unwrapRange<SlashJsonRaw[]>(parseScalar(data.tail), false);
  const tailRows = (tailPage.data ?? []).map(fromJson);
  let capped = tailRows.length >= LIFECYCLE_ROW_LIMIT;
  // the indexed blocks themselves trail the window's end: what is past them is not counted anywhere
  const indexedTo = us(tailPage.range?.covered_to);
  if (tailPage.range && (indexedTo === null || indexedTo < end - BigInt(INDEX_LAG_SLACK_MS) * BigInt(1000))) capped = true;
  // events with their time; one without a time cannot be placed in or out of a stretch: dropped, and the totals say
  // "at least"
  const timed = (rows: SlashRaw[]) => {
    const placed = rows.map((r) => ({ ...r, t: us(r.blockTime) })).filter((r): r is SlashRaw & { t: bigint } => r.t !== null);
    if (placed.length < rows.length) {
      console.warn(`slashing totals: ${rows.length - placed.length} events without a block time, left out`);
      capped = true;
    }
    return placed;
  };
  // the stretches to count from the indexed blocks: the whole window when the settlement tables cover nothing, else
  // each uncovered one once (coverage.ts: a late start, the gaps, the end past covered_to). An indexer that sends no
  // range leaves its totals as they are.
  const covered = !(t.range && notCovered(t.range));
  const spans: Array<[bigint, bigint]> = !t.range ? [] : covered ? uncoveredSpansMicros(t.range) : [[start, end]];
  let count = 0;
  let sum = BigInt(0);
  if (covered) {
    // one row per reason (PROOF_MISSING, PROOF_INVALID)
    const slashed = (t.data ?? []).filter((r) => r.kind === 'slashed');
    count = slashed.reduce((s, r) => s + num(r.events), 0);
    sum = slashed.reduce((s, r) => s + BigInt(r.slashed_upokt ?? '0'), BigInt(0));
  }
  // the events to place: the last hour (already read) and, for the stretches before it, one more read over exactly
  // their extent before the last hour (from the earliest start to the latest end, cut at the last hour), so its 1000
  // rows are not spent on the covered stretch after them
  const early = spans.filter(([a]) => a < tailFrom);
  let events = timed(tailRows);
  if (early.length) {
    const from = early.reduce((m, [a]) => (a < m ? a : m), early[0][0]);
    const to = early.reduce((m, [, b]) => {
      const cut = b < tailFrom ? b : tailFrom;
      return cut > m ? cut : m;
    }, from);
    const more = await slashesIn(addresses, microsToIso(from), microsToIso(to));
    capped ||= more.capped;
    events = events.concat(timed(more.rows));
  }
  const inSpans = events.filter((r) => spans.some(([a, b]) => r.t >= a && r.t < b));
  count += inSpans.length;
  sum += slashSum(inSpans);
  return { totalCount: count, penaltyUpokt: sum.toString(), capped };
}

/** One page of the operators' suppliers' slashing events in a range, newest first: the first page, or the rows after
 *  `after` (the endCursor of the page before, `height:id`). The pager (`lookahead`, one row past the page) reads the JSON
 *  twin, whose coverage comes even with no rows, so a page is one request; the export reads the list with only the
 *  fields it writes, `pageSize` rows with no lookahead row. */
export async function getOperatorSlashPage(
  addresses: string[],
  range: RangeKey,
  pageSize: number,
  after: string | null,
  lookahead = true,
  now?: number,
): Promise<Omit<SlashPage, keyof SlashTotals>> {
  const w = rangeWindow(range, now);
  const cut = after ? after.indexOf(':') : -1;
  if (after && cut <= 0) throw new Error(`slashing: invalid cursor ${after}`);
  const rowLimit = Math.min(lookahead ? pageSize + 1 : pageSize, LIFECYCLE_ROW_LIMIT);
  const vars = {
    operators: addresses,
    operatorScope: SLASH_OPERATOR_SCOPE,
    start: w.startISO,
    end: w.endISO,
    rowLimit,
    beforeHeight: after ? after.slice(0, cut) : null,
    beforeId: after ? after.slice(cut + 1) : null,
  };
  let covered: CoverageRange | null = null;
  let all: SlashRaw[];
  if (lookahead) {
    // no fetch cache (it would keep a 200 that carries `errors`): the route caches the validated page
    const data = await gqlFetch<{ getActorLifecycleJson: unknown }>(NETWORK, SUPPLIER_SLASH_PAGE, vars, { cache: 'no-store' });
    const page = unwrapRange<SlashJsonRaw[]>(parseScalar(data.getActorLifecycleJson), false);
    covered = page.range;
    all = (page.data ?? []).map(fromJson);
  } else {
    all = (await gqlFetch<{ getActorLifecycleList: SlashRaw[] | null }>(NETWORK, SUPPLIER_SLASHES, vars, { cache: 'no-store' })).getActorLifecycleList ?? [];
  }
  const nodes = all.slice(0, pageSize);
  const last = nodes[nodes.length - 1];
  return {
    // the export (no range) reads as indexed: it only follows the rows
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
