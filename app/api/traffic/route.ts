import { type NextRequest } from 'next/server';
import { rangeCached } from '@/lib/window-cache';
import { getTrafficOverview, type PerfPage } from '@/lib/data/traffic';
import { getCachedRolling24hStats, type Rolling24h } from '@/lib/data/rewards';
import { getLatestSnapshot } from '@/lib/data/snapshots';
import { getServicesCount } from '@/lib/data/services-meta';
import { rangeTTL } from '@/lib/timeranges';
import { DEFAULT_RANGE, isRangeKey, warmTag, type RangeKey } from '@/lib/app-config';
import { diagJson, restamp } from '@/lib/diagnostics';

export interface TrafficStats extends Rolling24h {
  activeServices: number;
  totalServices: number;
  servingSuppliers: number | null;
}

/** What the range-keyed cache actually stores: everything except the rolling-24h numbers, which are
 *  cached separately and merged in by the handler (see `getCachedRolling24hStats`). */
type TrafficBase = Omit<TrafficResponse, 'stats'> & { stats: Omit<TrafficStats, keyof Rolling24h> };

export interface DonutSlice {
  serviceId: string;
  name: string;
  sharePct: number;
}

export interface TrafficResponse {
  range: RangeKey;
  stats: TrafficStats;
  /** The network total and the top services, per bucket. */
  series: { interval: 'hour' | 'day' | 'week'; rows: Array<Record<string, number | string>>; services: Array<{ id: string; total: number }> };
  /** The Service Performance table's first page; later pages come from /api/services/usage. */
  performance: PerfPage;
  donut: DonutSlice[];
}

async function buildTraffic(range: RangeKey, now: number): Promise<TrafficBase> {
  // Everything here is range-dependent, so it is safe to cache under the range key. The 24h stat
  // cards are a fixed rolling window (brief §5.1) and are deliberately NOT built here — see GET.
  const [overview, snapshot, totalServices] = await Promise.all([getTrafficOverview(range, now), getLatestSnapshot(), getServicesCount()]);

  const stats: TrafficBase['stats'] = {
    activeServices: overview.page.totalServices,
    totalServices,
    servingSuppliers: snapshot?.stakedSuppliers ?? null,
  };

  // Distribution donut: top 6 services by CU share this window + "others", the rest of the network total.
  const { interval, rows, services, page: performance, donut } = overview;
  return { range, stats, series: { interval, rows, services }, performance, donut };
}

export async function GET(req: NextRequest) {
  const rangeParam = req.nextUrl.searchParams.get('range');
  const range: RangeKey = isRangeKey(rangeParam) ? rangeParam : DEFAULT_RANGE;
  // Cache the assembled payload so cold-after-warm loads don't re-hit the slow indexer resolvers.
  // The rolling-24h numbers are fetched from their own short-TTL entry and merged in *outside* that
  // cache: keeping them in it would freeze them for a full rangeTTL (up to 30 min) and give every
  // range pill its own separately-warmed copy, so the cards would disagree with the live strip and
  // with each other. Merged here, both surfaces read one entry and cannot drift apart.
  return diagJson('traffic', async () => {
    const [cached, rolling] = await Promise.all([
      rangeCached(['traffic', 'w2'], range, rangeTTL(range), (now) => buildTraffic(range, now), warmTag(range)),
      getCachedRolling24hStats(),
    ]);
    const payload: TrafficResponse = { ...cached.data, stats: { ...cached.data.stats, ...rolling } };
    return restamp(cached, payload);
  });
}
