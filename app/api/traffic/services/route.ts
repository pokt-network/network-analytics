import { type NextRequest } from 'next/server';
import { rangeCached } from '@/lib/window-cache';
import { getActiveServices } from '@/lib/data/traffic';
import { rangeTTL } from '@/lib/timeranges';
import { DEFAULT_RANGE, isRangeKey, type RangeKey } from '@/lib/app-config';
import { diagJson } from '@/lib/diagnostics';

// The Traffic chart's service selector: the services with usage in the window, in ranking order (estimated CU desc).
export async function GET(req: NextRequest) {
  const rangeParam = req.nextUrl.searchParams.get('range');
  const range: RangeKey = isRangeKey(rangeParam) ? rangeParam : DEFAULT_RANGE;
  return diagJson('traffic-services', () =>
    rangeCached(['traffic-services', 'w1'], range, rangeTTL(range), async (now) => ({ services: await getActiveServices(range, now) })),
  );
}
