import { NextResponse, type NextRequest } from 'next/server';
import { getOperatorSlashes, type SlashPage } from '@/lib/data/operator';
import { ADDRESS_RE } from '@/lib/staking/addresses';
import { DEFAULT_RANGE, isRangeKey, OWNER_ADDRESS_CAP, type RangeKey } from '@/lib/app-config';

const PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100; // indexer (PostGraphile) hard-caps `first` at 100.

function parseAddrs(param: string | null): string[] {
  if (!param) return [];
  return param.split(',').map((s) => s.trim()).filter((a) => ADDRESS_RE.test(a)).slice(0, OWNER_ADDRESS_CAP);
}

export async function GET(req: NextRequest) {
  const addresses = parseAddrs(req.nextUrl.searchParams.get('addresses'));
  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page')) || 1);
  const reqSize = Number(req.nextUrl.searchParams.get('pageSize'));
  const pageSize = Number.isFinite(reqSize) && reqSize > 0 ? Math.min(reqSize, MAX_PAGE_SIZE) : PAGE_SIZE;
  const rangeParam = req.nextUrl.searchParams.get('range');
  const range: RangeKey = isRangeKey(rangeParam) ? rangeParam : DEFAULT_RANGE;

  if (addresses.length === 0) return NextResponse.json({ rows: [], totalCount: 0, penaltyUpokt: 0 } satisfies SlashPage);
  return NextResponse.json(await getOperatorSlashes(addresses, range, page, pageSize));
}
