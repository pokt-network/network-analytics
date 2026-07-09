import { type NextRequest } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getSnapshots } from '@/lib/data/snapshots';
import { getDomainTable, type DomainRow } from '@/lib/data/suppliers';
import { rangeWindow, rangeTTL } from '@/lib/timeranges';
import { DEFAULT_RANGE, isRangeKey, warmTag, type RangeKey } from '@/lib/app-config';
import { UPOKT_PER_POKT } from '@/lib/config';
import { diagJson, stamped } from '@/lib/diagnostics';

export interface SupplierStats {
  totalSuppliers: number;
  totalStakedPokt: number;
  avgStakePokt: number;
  distinctDomains: number;
  snapshotDate: string | null;
}

export interface SupplierConcentration {
  domain: string;
  sharePct: number;
}

export interface SuppliersResponse {
  range: RangeKey;
  stats: SupplierStats;
  evolution: Array<{ date: string; suppliers: number; stakedPokt: number }>;
  domains: DomainRow[];
  concentration: SupplierConcentration[];
  interval: 'hour' | 'day' | 'week';
}

async function buildSuppliers(range: RangeKey): Promise<SuppliersResponse> {
  const w = rangeWindow(range);

  const [snaps, domains] = await Promise.all([getSnapshots(w.startISO, w.endISO, 3600), getDomainTable()]);
  const latest = snaps.at(-1) ?? null;
  const totalStakedPokt = latest ? latest.supplierTokens / UPOKT_PER_POKT : 0;
  const totalSuppliers = latest?.stakedSuppliers ?? 0;

  const stats: SupplierStats = {
    totalSuppliers,
    totalStakedPokt,
    avgStakePokt: totalSuppliers > 0 ? totalStakedPokt / totalSuppliers : 0,
    distinctDomains: domains.length,
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
    evolution: snaps.map((s) => ({ date: s.date, suppliers: s.stakedSuppliers, stakedPokt: s.supplierTokens / UPOKT_PER_POKT })),
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
