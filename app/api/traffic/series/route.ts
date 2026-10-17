import { type NextRequest } from 'next/server';
import { rangeCached } from '@/lib/window-cache';
import { getServicesSeries } from '@/lib/data/traffic';
import { SERIES_MAX } from '@/lib/traffic-limits';
import { rangeTTL } from '@/lib/timeranges';
import { DEFAULT_RANGE, isRangeKey, type RangeKey } from '@/lib/app-config';
import { diagJson } from '@/lib/diagnostics';

// The services picked for the Traffic Over Time chart (comma-separated, at most 20), per bucket.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const rangeParam = q.get('range');
  const range: RangeKey = isRangeKey(rangeParam) ? rangeParam : DEFAULT_RANGE;
  const services = [...new Set((q.get('services') ?? '').split(',').filter(Boolean))].sort();
  if (services.length > SERIES_MAX) return Response.json({ error: `at most ${SERIES_MAX} services` }, { status: 400 });
  return diagJson('traffic-series', () =>
    rangeCached(['traffic-series', 'w1', services.join(',')], range, rangeTTL(range), async (now) => ({ rows: await getServicesSeries(range, services, now) })),
  );
}
