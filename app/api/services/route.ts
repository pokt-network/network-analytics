import { NextResponse, type NextRequest } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getServiceDetail } from '@/lib/data/services';
import { rangeTTL } from '@/lib/timeranges';
import { DEFAULT_RANGE, isRangeKey, type RangeKey } from '@/lib/app-config';
import { diagJson, stamped } from '@/lib/diagnostics';

export async function GET(req: NextRequest) {
  const serviceId = req.nextUrl.searchParams.get('serviceId');
  if (!serviceId) return NextResponse.json({ error: 'serviceId required' }, { status: 400 });
  const rangeParam = req.nextUrl.searchParams.get('range');
  const range: RangeKey = isRangeKey(rangeParam) ? rangeParam : DEFAULT_RANGE;

  return diagJson('service', () =>
    unstable_cache(stamped(() => getServiceDetail(serviceId, range)), ['service', serviceId, range], {
      revalidate: rangeTTL(range),
    })(),
  );
}
