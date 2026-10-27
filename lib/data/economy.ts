import { gqlFetch } from '@/lib/graphql';
import { toDate } from '@/lib/time';
import { NETWORK } from '@/lib/app-config';
import { UPOKT_PER_POKT } from '@/lib/config';
import { dayWindow } from '@/lib/timeranges';
import { SUPPLY_BY_DAY, SUPPLY_COMPOSITION, TOKENOMICS_PARAM } from '@/lib/queries/analytics';
import { getRewardsByDate } from './rewards';
import { num, parseScalar } from './_util';
import { unwrapRange } from './coverage';

const toPokt = (u: number) => u / UPOKT_PER_POKT;

// ── Supply history (getSupplyJson, by day) ──────────────────────────────────────
interface SupplyRaw {
  bucket_start: string;
  total_supply_upokt: number | string;
}
export interface SupplyPoint {
  date: string;
  totalSupplyPokt: number;
}

export async function getSupplyHistory(startISO: string, endISO: string, revalidate = 3600): Promise<SupplyPoint[]> {
  const data = await gqlFetch<{ getSupplyJson: unknown }>(
    NETWORK,
    SUPPLY_BY_DAY,
    { start: startISO, end: endISO },
    { revalidate },
  );
  // a day the indexer does not cover has no row (not a zero), as before
  return (unwrapRange<SupplyRaw[]>(parseScalar(data.getSupplyJson), false).data ?? [])
    .map((r) => ({ date: toDate(r.bucket_start)?.toISOString() ?? r.bucket_start, totalSupplyPokt: toPokt(num(r.total_supply_upokt)) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Net inflation %/yr from the authoritative total_supply delta over a 30-day window (cheap,
 *  captures true net regardless of mint/burn regime). Deflationary → negative. */
export async function getNetInflationPctYr(): Promise<number> {
  const { startISO, endISO } = dayWindow(30);
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
// The daily Σclaimed is getNetworkRewardsJson's claimed_upokt, so gross burn/mint are derivable live
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

// ── Supply composition (getSupplyCompositionJson + getSupplyJson, latest point) ──
// One composition row per label and bucket, and the bucket's totals in the supply rows, both at the same block.
interface CompRaw {
  height: string;
  label: string;
  amount_upokt: number | string;
}
interface CompSupplyRaw {
  height: string;
  total_supply_upokt: number | string;
}
export interface CompSlice {
  label: string;
  pokt: number;
  pct: number;
}

export async function getComposition(): Promise<CompSlice[]> {
  const { startISO, endISO } = dayWindow(3);
  const data = await gqlFetch<{ composition: unknown; supply: unknown }>(
    NETWORK,
    SUPPLY_COMPOSITION,
    { start: startISO, end: endISO, interval: 'day' },
    { revalidate: 3600 },
  );
  const rows = unwrapRange<CompRaw[]>(parseScalar(data.composition), false).data ?? [];
  const supply = unwrapRange<CompSupplyRaw[]>(parseScalar(data.supply), false).data ?? [];
  // the latest point both answers hold (the same block: each bucket's last one with an upokt supply)
  const latest = supply.filter((s) => rows.some((r) => r.height === s.height)).sort((a, b) => num(b.height) - num(a.height))[0];
  if (!latest) return [];
  const comp = new Map<string, number>();
  for (const c of rows) if (c.height === latest.height) comp.set(c.label, num(c.amount_upokt));
  const get = (k: string) => comp.get(k) ?? 0;
  const total = num(latest.total_supply_upokt);
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

// ── Supply projection (naive v1) ────────────────────────────────────────────────
// The network is deflationary, so supply never grows — every scenario declines. The variable is
// demand → burn magnitude. The real net burn is only ~0.1%/yr (a strict extrapolation would be a
// flat, uninformative line), so we render an illustrative deflationary fan by the 2y horizon:
//   • low demand  → least burn  → ~−2%
//   • current     → mid case    → ~−5%
//   • high demand → most burn   → ~−10%
// Magnitudes are illustrative (pending PNF's mechanistic model + scenario sign-off). The measured
// instantaneous net inflation (~−0.09%/yr, near flat) is surfaced separately in the stat cards.
export interface ProjectionPoint {
  label: string;
  monthsOut: number;
  low: number;
  current: number;
  high: number;
}

const HORIZON_MONTHS = 24;
// Fraction of current supply burned by the horizon, per demand scenario (all ≥ 0 → all deflationary).
const BURN_BY_HORIZON = { low: 0.02, current: 0.05, high: 0.1 };

export function buildProjection(supply0Pokt: number): ProjectionPoint[] {
  const months = [0, 6, 12, 18, 24];
  return months.map((m) => {
    const f = m / HORIZON_MONTHS; // 0 → 1 across the horizon
    return {
      label: m === 0 ? 'now' : `+${m}mo`,
      monthsOut: m,
      low: supply0Pokt * (1 - BURN_BY_HORIZON.low * f),
      current: supply0Pokt * (1 - BURN_BY_HORIZON.current * f),
      high: supply0Pokt * (1 - BURN_BY_HORIZON.high * f),
    };
  });
}
