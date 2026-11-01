import { type NextRequest } from 'next/server';
import { rangeCached } from '@/lib/window-cache';
import { getSnapshots } from '@/lib/data/snapshots';
import { getDomainTable, type DomainRow } from '@/lib/data/suppliers';
import { getActiveServiceConfigs } from '@/lib/data/traffic';
import { rangeWindow, rangeTTL } from '@/lib/timeranges';
import { DEFAULT_RANGE, isRangeKey, warmTag, type RangeKey } from '@/lib/app-config';
import { UPOKT_PER_POKT } from '@/lib/config';
import { diagJson } from '@/lib/diagnostics';

export interface SupplierStats {
  totalSuppliers: number;
  totalStakedPokt: number;
  /** Σ(staked suppliers per service) ÷ distinct suppliers — how many services the typical operator
   *  runs. Structural (near range-invariant); replaces avg stake, which is ~pinned to the min-stake. */
  avgServicesPerSupplier: number;
  /** % change in staked suppliers from the first to the last daily snapshot in the window; null when
   *  there are <2 snapshots (e.g. the 24h range) so we don't fabricate a trend. */
  supplierGrowthPct: number | null;
  snapshotDate: string | null;
}

export interface SupplierConcentration {
  domain: string;
  sharePct: number;
}

export interface SuppliersResponse {
  range: RangeKey;
  stats: SupplierStats;
  evolution: Array<{ date: string; suppliers: number; stakedPokt: number; unstaking: number }>;
  domains: DomainRow[];
  concentration: SupplierConcentration[];
  interval: 'hour' | 'day' | 'week';
}

async function buildSuppliers(range: RangeKey, now: number): Promise<SuppliersResponse> {
  const w = rangeWindow(range, now);

  const [snaps, domains, serviceConfigs] = await Promise.all([
    getSnapshots(w.startISO, w.endISO, 3600),
    getDomainTable(),
    getActiveServiceConfigs(range, now),
  ]);
  const latest = snaps.at(-1) ?? null;
  const first = snaps[0] ?? null;
  const totalStakedPokt = latest ? latest.supplierTokens / UPOKT_PER_POKT : 0;
  const totalSuppliers = latest?.stakedSuppliers ?? 0;

  // A supplier serving N services is counted once per service in the staked suppliers summed over the services with
  // usage in the window (the indexer's network total), so that sum ÷ distinct suppliers = avg services the typical
  // supplier runs.
  const avgServicesPerSupplier = totalSuppliers > 0 ? serviceConfigs / totalSuppliers : 0;

  // Supplier growth across the window (first vs last daily snapshot). Null unless ≥2 snapshots.
  const supplierGrowthPct =
    snaps.length >= 2 && first && latest && first.stakedSuppliers > 0
      ? ((latest.stakedSuppliers - first.stakedSuppliers) / first.stakedSuppliers) * 100
      : null;

  const stats: SupplierStats = {
    totalSuppliers,
    totalStakedPokt,
    avgServicesPerSupplier,
    supplierGrowthPct,
    snapshotDate: latest?.date ?? null,
  };

  // Concentration donut: top 5 domains by stake share + aggregated "others".
  const TOP = 5;
  const top = domains.slice(0, TOP).map((d) => ({ domain: d.domain, sharePct: d.sharePct }));
  const othersShare = domains.slice(TOP).reduce((s, d) => s + d.sharePct, 0);
  const concentration =
    othersShare > 0 ? [...top, { domain: `others (${domains.length - TOP})`, sharePct: othersShare }] : top;

  return {
    range,
    stats,
    evolution: snaps.map((s) => ({
      date: s.date,
      suppliers: s.stakedSuppliers,
      stakedPokt: s.supplierTokens / UPOKT_PER_POKT,
      unstaking: s.unstakingSuppliers,
    })),
    domains,
    concentration,
    interval: w.interval,
  };
}

export async function GET(req: NextRequest) {
  const rangeParam = req.nextUrl.searchParams.get('range');
  const range: RangeKey = isRangeKey(rangeParam) ? rangeParam : DEFAULT_RANGE;
  // Suppliers change slowly and the per-domain stats are heavy → cache long, warmer keeps it fresh.
  // NOTE: bump the cache-key version (`sup-v3`) whenever the SupplierStats/evolution payload shape
  // changes. The Vercel Data Cache persists across deploys, so without a new key a new deployment
  // would serve old-shaped entries to new client code (→ runtime crash on the missing fields).
  return diagJson('suppliers', () =>
    rangeCached(['suppliers', 'sup-v3'], range, rangeTTL(range), (now) => buildSuppliers(range, now), warmTag(range)),
  );
}
