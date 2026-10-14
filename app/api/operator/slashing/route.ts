import { NextResponse, type NextRequest } from 'next/server';
import { getOperatorSlashes, type SlashPage } from '@/lib/data/operator';
import { ADDRESS_RE } from '@/lib/staking/addresses';
import { DEFAULT_RANGE, isRangeKey, OWNER_ADDRESS_CAP, type RangeKey } from '@/lib/app-config';

const PAGE_SIZE = 25;
// the indexer's getActorLifecycleList returns at most 1000 rows a call, and each page reads one row more to tell whether
// another follows
const MAX_PAGE_SIZE = 999;
// endCursor of a page: the last row's height and id
const CURSOR_RE = /^\d+:.+$/;

function parseAddrs(param: string | null): string[] {
  if (!param) return [];
  return param.split(',').map((s) => s.trim()).filter((a) => ADDRESS_RE.test(a)).slice(0, OWNER_ADDRESS_CAP);
}

export async function GET(req: NextRequest) {
  const addresses = parseAddrs(req.nextUrl.searchParams.get('addresses'));
  const reqSize = Number(req.nextUrl.searchParams.get('pageSize'));
  const pageSize = Number.isFinite(reqSize) && reqSize > 0 ? Math.min(reqSize, MAX_PAGE_SIZE) : PAGE_SIZE;
  const rangeParam = req.nextUrl.searchParams.get('range');
  const range: RangeKey = isRangeKey(rangeParam) ? rangeParam : DEFAULT_RANGE;
  // after=<endCursor of the previous page> reads the rows that follow it; without it, the first page.
  const afterParam = req.nextUrl.searchParams.get('after');
  if (afterParam && !CURSOR_RE.test(afterParam)) return NextResponse.json({ error: 'invalid after cursor' }, { status: 400 });
  const after = afterParam || null;

  if (addresses.length === 0) return NextResponse.json({ rows: [], totalCount: 0, penaltyUpokt: '0', indexed: true } satisfies SlashPage);
  return NextResponse.json(await getOperatorSlashes(addresses, range, pageSize, after));
}
