import { NextResponse, type NextRequest } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getServicesPerformance } from '@/lib/data/traffic';
import { rangeTTL } from '@/lib/timeranges';
import { DEFAULT_RANGE, isRangeKey, warmTag, type RangeKey } from '@/lib/app-config';

// Per-service analytics for the Services tab top-level table: staked-supplier count + windowed CU
// (both from servicesPerformanceBetweenTimes). Range-dependent — the CU total follows the pills.
export interface ServiceAnalyticsRow {
  id: string;
  name: string;
  suppliers: number;
  cu: number; // estimated computed units over the range
  relays: number;
}

export async function GET(req: NextRequest) {
  const rangeParam = req.nextUrl.searchParams.get('range');
  const range: RangeKey = isRangeKey(rangeParam) ? rangeParam : DEFAULT_RANGE;

  const services = await unstable_cache(
    async () => {
      const perf = await getServicesPerformance(range);
      return perf.map((p) => ({
        id: p.serviceId,
        name: p.serviceName || p.serviceId,
        suppliers: p.suppliersStaked,
        cu: p.estimatedComputedUnits,
        relays: p.estimatedRelays,
      })) satisfies ServiceAnalyticsRow[];
    },
    ['services-analytics', range],
    { revalidate: rangeTTL(range), tags: warmTag(range) },
  )();

  return NextResponse.json({ services });
}
