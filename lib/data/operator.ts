import { gqlFetch } from '@/lib/graphql';
import { toDate } from '@/lib/time';
import { UPOKT_PER_POKT } from '@/lib/config';
import { NETWORK, type RangeKey } from '@/lib/app-config';
import { rangeWindow, rangeTTL } from '@/lib/timeranges';
import {
  OPERATOR_SUPPLIER_SUMMARY,
  OPERATOR_CLAIMS_SETTLED,
  OPERATOR_CLAIM_PENALTIES,
  REWARDS_BY_ADDRESSES_SERVICE,
  OVERSERVICED_BY_ADDRESSES,
  SUPPLIER_SLASHES,
} from '@/lib/queries/analytics';
import { num, parseScalar } from './_util';
import { unwrapRange, fillCoverage, type CoverageRange } from './coverage';
import { getRewardsWindow } from './owner';
import { fetchSuppliers, type SupplierListPage } from './suppliers-list';

// Re-export so existing operator-tab imports keep working.
export type { SupplierRow, SupplierListPage } from './suppliers-list';

const toPokt = (u: number) => u / UPOKT_PER_POKT;

// The Operator tool's addresses are rev-share recipients. A supplier "belongs to" an operator if any
// of the operator's addresses appears in a serviceConfig's revShare. This builds the SupplierFilter
// (an OR of per-address JSONB containment checks) that both the fleet summary and the slashing feed
// scope to. Passed as a typed GraphQL variable (SupplierFilter) rather than string-interpolated.
function revShareSupplierFilter(addresses: string[]): Record<string, unknown> {
  return {
    or: addresses.map((address) => ({
      serviceConfigs: { some: { revShare: { contains: [{ address }] } } },
    })),
  };
}

interface SupplierSummaryRaw {
  totalCount: number;
  aggregates: { sum: { stakeAmount: string | number | null } | null } | null;
}

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
    gqlFetch<{ suppliers: SupplierSummaryRaw | null }>(
      NETWORK,
      OPERATOR_SUPPLIER_SUMMARY,
      { filter: revShareSupplierFilter(addresses) },
      { revalidate: 1800 },
    ),
    getRewardsWindow(addresses, 24 * 3600),
    getRewardsWindow(addresses, 48 * 3600),
  ]);
  return {
    supplierCount: fleet.suppliers?.totalCount ?? 0,
    stakedPokt: toPokt(num(fleet.suppliers?.aggregates?.sum?.stakeAmount)),
    rewards24hPokt: r24,
    rewards48hPokt: r48,
  };
}

// ── Suppliers list ──
export async function getOperatorSuppliers(addresses: string[], page: number, pageSize = 25): Promise<SupplierListPage> {
  return fetchSuppliers(revShareSupplierFilter(addresses), page, pageSize);
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
  supplierId: string;
  blockId: string | number;
  proofMissingPenalty: string | number;
  previousStakeAmount: string | number;
  afterStakeAmount: string | number;
  proofValidationStatus: string | null;
  serviceId: string | null;
  applicationId: string | null;
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
  totalCount: number;
}

export async function getOperatorSlashes(addresses: string[], page: number, pageSize = 25): Promise<SlashPage> {
  const data = await gqlFetch<{ eventSupplierSlasheds: { totalCount: number; nodes: SlashRaw[] } | null }>(
    NETWORK,
    SUPPLIER_SLASHES,
    { filter: { supplier: revShareSupplierFilter(addresses) }, first: pageSize, offset: (page - 1) * pageSize },
    { revalidate: 300 },
  );
  const d = data.eventSupplierSlasheds;
  return {
    totalCount: d?.totalCount ?? 0,
    rows: (d?.nodes ?? []).map((n) => ({
      supplier: n.supplierId,
      block: num(n.blockId),
      penaltyUpokt: num(n.proofMissingPenalty),
      prevStakeUpokt: num(n.previousStakeAmount),
      afterStakeUpokt: num(n.afterStakeAmount),
      proofStatus: n.proofValidationStatus,
      serviceId: n.serviceId,
      applicationId: n.applicationId,
    })),
  };
}
