import { NextResponse, type NextRequest } from 'next/server';
import { rangeCached } from '@/lib/window-cache';
import { getServiceDetail } from '@/lib/data/services';
import { rangeTTL } from '@/lib/timeranges';
import { DEFAULT_RANGE, isRangeKey, type RangeKey } from '@/lib/app-config';
import { diagJson } from '@/lib/diagnostics';

export async function GET(req: NextRequest) {
  const serviceId = req.nextUrl.searchParams.get('serviceId');
  if (!serviceId) return NextResponse.json({ error: 'serviceId required' }, { status: 400 });
  const rangeParam = req.nextUrl.searchParams.get('range');
  const range: RangeKey = isRangeKey(rangeParam) ? rangeParam : DEFAULT_RANGE;

  return diagJson('service', () =>
    rangeCached(['service', 'w1', serviceId], range, rangeTTL(range), (now) => getServiceDetail(serviceId, range, now)),
  );
}
