import { NextResponse, type NextRequest } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getTrafficSeries, getServicesPerformance, type TrafficSeries, type ServicePerf } from '@/lib/data/traffic';
import { getRolling24hStats } from '@/lib/data/rewards';
import { getLatestSnapshot } from '@/lib/data/snapshots';
import { getServicesCount } from '@/lib/data/services-meta';
import { rangeTTL } from '@/lib/timeranges';
import { DEFAULT_RANGE, isRangeKey, type RangeKey } from '@/lib/app-config';

export interface TrafficStats {
  relays24h: number;
  relays24hChange: number;
  cu24h: number;
  cu24hChange: number;
  activeServices: number;
  totalServices: number;
  servingSuppliers: number | null;
}

export interface DonutSlice {
  serviceId: string;
  name: string;
  sharePct: number;
}

export interface TrafficResponse {
  range: RangeKey;
  stats: TrafficStats;
  series: TrafficSeries;
  performance: ServicePerf[];
  donut: DonutSlice[];
}

async function buildTraffic(range: RangeKey): Promise<TrafficResponse> {
  // 24h stat cards use a fixed rolling window (brief §5.1), independent of the range pills.
  const [series, performance, rolling, snapshot, totalServices] = await Promise.all([
    getTrafficSeries(range),
    getServicesPerformance(range),
    getRolling24hStats(),
    getLatestSnapshot(),
    getServicesCount(),
  ]);

  const stats: TrafficStats = {
    relays24h: rolling.relays24h,
    relays24hChange: rolling.relays24hChange,
    cu24h: rolling.cu24h,
    cu24hChange: rolling.cu24hChange,
    activeServices: series.services.length,
    totalServices,
    servingSuppliers: snapshot?.stakedSuppliers ?? null,
  };

  // Distribution donut: top 6 services by CU share this window + an aggregated "others" slice.
  const TOP = 6;
  const top = performance.slice(0, TOP).map((p) => ({
    serviceId: p.serviceId,
    name: p.serviceName || p.serviceId,
    sharePct: p.sharePct,
  }));
  const othersShare = performance.slice(TOP).reduce((s, p) => s + p.sharePct, 0);
  const donut: DonutSlice[] =
    othersShare > 0 ? [...top, { serviceId: '__others__', name: 'others', sharePct: othersShare }] : top;

  return { range, stats, series, performance, donut };
}

export async function GET(req: NextRequest) {
  const rangeParam = req.nextUrl.searchParams.get('range');
  const range: RangeKey = isRangeKey(rangeParam) ? rangeParam : DEFAULT_RANGE;
  // Cache the assembled payload so cold-after-warm loads don't re-hit the slow indexer resolvers.
  const payload = await unstable_cache(() => buildTraffic(range), ['traffic', range], { revalidate: rangeTTL(range) })();
  return NextResponse.json(payload);
}
