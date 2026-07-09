import { type NextRequest } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getSnapshots } from '@/lib/data/snapshots';
import { getDomainTable, type DomainRow } from '@/lib/data/suppliers';
import { getServicesPerformance } from '@/lib/data/traffic';
import { rangeWindow, rangeTTL } from '@/lib/timeranges';
import { DEFAULT_RANGE, isRangeKey, warmTag, type RangeKey } from '@/lib/app-config';
import { UPOKT_PER_POKT } from '@/lib/config';
import { diagJson, stamped } from '@/lib/diagnostics';

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

async function buildSuppliers(range: RangeKey): Promise<SuppliersResponse> {
  const w = rangeWindow(range);

  const [snaps, domains, perf] = await Promise.all([
    getSnapshots(w.startISO, w.endISO, 3600),
    getDomainTable(),
    getServicesPerformance(range),
  ]);
  const latest = snaps.at(-1) ?? null;
  const first = snaps[0] ?? null;
  const totalStakedPokt = latest ? latest.supplierTokens / UPOKT_PER_POKT : 0;
  const totalSuppliers = latest?.stakedSuppliers ?? 0;

  // A supplier serving N services is counted once per service in `suppliersStaked`, so the sum over
  // services ÷ distinct suppliers = avg services the typical supplier runs.
  const serviceConfigs = perf.reduce((s, p) => s + p.suppliersStaked, 0);
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
  return diagJson('suppliers', () =>
    unstable_cache(stamped(() => buildSuppliers(range)), ['suppliers', range], {
      revalidate: rangeTTL(range),
      tags: warmTag(range),
    })(),
  );
}
