import { gqlFetch } from '@/lib/graphql';
import { toDate } from '@/lib/time';
import { NETWORK } from '@/lib/app-config';
import { UPOKT_PER_POKT } from '@/lib/config';
import { fixedWindow } from '@/lib/timeranges';
import { TOTAL_SUPPLY_BY_DAY, SUPPLY_COMPOSITION, TOKENOMICS_PARAM } from '@/lib/queries/analytics';
import { getRewardsByDate } from './rewards';
import { num, parseScalar } from './_util';

const toPokt = (u: number) => u / UPOKT_PER_POKT;

// ── Supply history (getTotalSupplyByDay) ────────────────────────────────────────
interface SupplyRaw {
  day: string;
  total_supply: number | string;
}
export interface SupplyPoint {
  date: string;
  totalSupplyPokt: number;
}

export async function getSupplyHistory(startISO: string, endISO: string, revalidate = 3600): Promise<SupplyPoint[]> {
  const data = await gqlFetch<{ getTotalSupplyByDay: unknown }>(
    NETWORK,
    TOTAL_SUPPLY_BY_DAY,
    { start: startISO, end: endISO },
    { revalidate },
  );
  return parseScalar<SupplyRaw[]>(data.getTotalSupplyByDay)
    .map((r) => ({ date: toDate(r.day)?.toISOString() ?? r.day, totalSupplyPokt: toPokt(num(r.total_supply)) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Net inflation %/yr from the authoritative total_supply delta over a fixed 30d window (cheap,
 *  captures true net regardless of mint/burn regime). Deflationary → negative. */
export async function getNetInflationPctYr(): Promise<number> {
  const { startISO, endISO } = fixedWindow(30 * 86400);
  const pts = await getSupplyHistory(startISO, endISO, 3600);
  if (pts.length < 2) return 0;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const days = Math.max(1, (Date.parse(last.date) - Date.parse(first.date)) / 86_400_000);
  const perDay = (last.totalSupplyPokt - first.totalSupplyPokt) / days;
  return last.totalSupplyPokt > 0 ? ((perDay * 365) / last.totalSupplyPokt) * 100 : 0;
}

/** Live mint_ratio (never hardcode — read the current on-chain tokenomics param). */
export async function getMintRatio(): Promise<number> {
  const data = await gqlFetch<{ params: { nodes: Array<{ key: string; value: string }> } }>(
    NETWORK,
    TOKENOMICS_PARAM,
    { key: 'mint_ratio' },
    { revalidate: 3600 },
  );
  const n = Number(data.params?.nodes?.[0]?.value);
  // Last-resort fallback only if the param is unreadable; the normal path reads it live.
  return Number.isFinite(n) && n > 0 ? n : 0.975;
}

// ── Burn vs Mint ────────────────────────────────────────────────────────────────
// Per PIP-41 each settlement burns the full claimed amount and re-mints mintRatio of it:
//   mint = claimed × mint_ratio,  burn = claimed  → net = claimed × (mint_ratio − 1) (deflation).
// The daily Σclaimed is getRewardsByDate.claimed_amount, so gross burn/mint are derivable live
// (no per-settlement scan). Verified: mockup mint/burn ratio == mint_ratio (0.975).
export interface BurnMintPoint {
  date: string;
  mintPokt: number;
  burnPokt: number;
}

export async function getBurnMint(
  startISO: string,
  endISO: string,
  interval: 'hour' | 'day' | 'week',
  mintRatio: number,
  revalidate = 300,
): Promise<BurnMintPoint[]> {
  const rewards = await getRewardsByDate(startISO, endISO, interval, revalidate);
  return rewards.map((r) => {
    const burn = toPokt(r.claimedAmount);
    return { date: r.date, burnPokt: burn, mintPokt: burn * mintRatio };
  });
}

// ── Supply composition (getSupplyCompositionBetweenDates, latest point) ──────────
interface CompRaw {
  date_truncated: string;
  total_supply: number | string;
  network_supply_composition: Array<{ label: string; amount: number | string }>;
}
export interface CompSlice {
  label: string;
  pokt: number;
  pct: number;
}

export async function getComposition(): Promise<CompSlice[]> {
  const { startISO, endISO } = fixedWindow(3 * 86400);
  const data = await gqlFetch<{ getSupplyCompositionBetweenDates: unknown }>(
    NETWORK,
    SUPPLY_COMPOSITION,
    { start: startISO, end: endISO, interval: 'day' },
    { revalidate: 3600 },
  );
  const arr = parseScalar<CompRaw[]>(data.getSupplyCompositionBetweenDates);
  const latest = arr[arr.length - 1];
  if (!latest) return [];
  const comp = new Map<string, number>();
  for (const c of latest.network_supply_composition ?? []) comp.set(c.label, num(c.amount));
  const get = (k: string) => comp.get(k) ?? 0;
  const total = num(latest.total_supply);
  const allocated = [...comp.values()].reduce((s, v) => s + v, 0);

  // Label semantics (verified): `others` = free/circulating balances (the big liquid bucket);
  // `total_supply − network_supply` = unmigrated Morse tokens. The rest are module pools.
  const liquid = get('others');
  const supplier = get('supplier');
  const bonded = get('bonded_tokens_pool');
  const unmigrated = Math.max(0, total - allocated);
  const otherPools = allocated - liquid - supplier - bonded; // dao + wrapped + distribution + app + …

  const slices = [
    { label: 'Unstaked / liquid', pokt: toPokt(liquid) },
    { label: 'Supplier stake', pokt: toPokt(supplier) },
    { label: 'Bonded (validators)', pokt: toPokt(bonded) },
    { label: 'Unmigrated (Morse)', pokt: toPokt(unmigrated) },
    { label: 'DAO / other pools', pokt: toPokt(otherPools) },
  ];
  const sum = slices.reduce((s, x) => s + x.pokt, 0) || 1;
  return slices.map((s) => ({ ...s, pct: (s.pokt / sum) * 100 }));
}

// ── Supply projection (naive v1, all deflationary) ──────────────────────────────
// supply(t) = supply0 + avgDailyClaimed × demandFactor × (mintRatio − 1) × days.
// Higher demand burns more against supply → deflates faster. Labeled "simple projection".
export interface ProjectionPoint {
  label: string;
  monthsOut: number;
  low: number;
  current: number;
  high: number;
}

export function buildProjection(supply0Pokt: number, avgDailyClaimedPokt: number, mintRatio: number): ProjectionPoint[] {
  const netPerClaim = mintRatio - 1; // negative
  const factors = { low: 0.6, current: 1.0, high: 1.5 };
  const months = [0, 6, 12, 18, 24];
  return months.map((m) => {
    const days = m * 30;
    const proj = (f: number) => supply0Pokt + avgDailyClaimedPokt * f * netPerClaim * days;
    return {
      label: m === 0 ? 'now' : `+${m}mo`,
      monthsOut: m,
      low: proj(factors.low),
      current: proj(factors.current),
      high: proj(factors.high),
    };
  });
}
