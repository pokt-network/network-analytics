import { NextResponse, type NextRequest } from 'next/server';
import { getServiceDetail } from '@/lib/data/services';
import { DEFAULT_RANGE, isRangeKey, type RangeKey } from '@/lib/app-config';

export async function GET(req: NextRequest) {
  const serviceId = req.nextUrl.searchParams.get('serviceId');
  if (!serviceId) return NextResponse.json({ error: 'serviceId required' }, { status: 400 });
  const rangeParam = req.nextUrl.searchParams.get('range');
  const range: RangeKey = isRangeKey(rangeParam) ? rangeParam : DEFAULT_RANGE;

  const detail = await getServiceDetail(serviceId, range);
  return NextResponse.json(detail);
}
