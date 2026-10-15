import { NextResponse, type NextRequest } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getOperatorSlashPage, getOperatorSlashTotals, type SlashPage } from '@/lib/data/operator';
import { ADDRESS_RE } from '@/lib/staking/addresses';
import { DEFAULT_RANGE, isRangeKey, OWNER_ADDRESS_CAP, type RangeKey } from '@/lib/app-config';

const PAGE_SIZE = 25;
// the indexer returns at most 1000 rows a call. A pager page reads one row more to tell whether another follows, so it
// takes up to 999; the export walk (lookahead=0) reads no extra row and takes up to 1000, stopping at a short page.
const MAX_PAGE_SIZE = 999;
const MAX_EXPORT_PAGE_SIZE = 1000;
// endCursor of a page: the last row's height and id
const CURSOR_RE = /^\d+:.+$/;

function parseAddrs(param: string | null): string[] {
  if (!param) return [];
  return param.split(',').map((s) => s.trim()).filter((a) => ADDRESS_RE.test(a)).slice(0, OWNER_ADDRESS_CAP);
}

// One page of slashing events (keyset) and the range's totals. The totals are computed once per range and cached
// (small), each page is its own small cached read.
export async function GET(req: NextRequest) {
  const addresses = parseAddrs(req.nextUrl.searchParams.get('addresses'));
  const lookahead = req.nextUrl.searchParams.get('lookahead') !== '0';
  const reqSize = Number(req.nextUrl.searchParams.get('pageSize'));
  const pageSize =
    Number.isFinite(reqSize) && reqSize > 0 ? Math.min(Math.floor(reqSize), lookahead ? MAX_PAGE_SIZE : MAX_EXPORT_PAGE_SIZE) : PAGE_SIZE;
  const rangeParam = req.nextUrl.searchParams.get('range');
  const range: RangeKey = isRangeKey(rangeParam) ? rangeParam : DEFAULT_RANGE;
  // after=<endCursor of the previous page> reads the rows that follow it; without it, the first page. An after that is
  // present but empty or malformed is an error, never read as the first page.
  const after = req.nextUrl.searchParams.get('after');
  if (after !== null && !CURSOR_RE.test(after)) return NextResponse.json({ error: 'invalid after cursor' }, { status: 400 });

  if (addresses.length === 0) {
    return NextResponse.json({
      rows: [], hasNextPage: false, endCursor: null, indexed: true, range: null, totalCount: 0, penaltyUpokt: '0', capped: false,
    } satisfies SlashPage);
  }
  const [totals, page] = await Promise.all([
    unstable_cache(() => getOperatorSlashTotals(addresses, range), ['operator-slash-totals', addresses.join(','), range], { revalidate: 300 })(),
    // the validated page is what is cached (5 min): an answer with `errors` or one that fails to process throws and is
    // not kept (the reads use no fetch cache)
    unstable_cache(
      () => getOperatorSlashPage(addresses, range, pageSize, after, lookahead),
      ['operator-slash-page', addresses.join(','), range, after ?? '', String(pageSize), lookahead ? 'pager' : 'export'],
      { revalidate: 300 },
    )(),
  ]);
  return NextResponse.json({ ...page, ...totals } satisfies SlashPage);
}
