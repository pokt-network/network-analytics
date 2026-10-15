import { NextResponse, type NextRequest } from 'next/server';
import { staleValue } from '@/lib/window-cache';
import { getOwnerIssuances, type IssuancePage } from '@/lib/data/owner';
import { ADDRESS_RE } from '@/lib/staking/addresses';
import { OWNER_ADDRESS_CAP } from '@/lib/app-config';

const PAGE_SIZE = 25;
// Larger pages are only used by the CSV "export all" path, which walks pages client-side. The indexer's
// getClaimsList returns at most 1000 rows a call. A pager page reads one row more to tell whether another follows, so it
// takes up to 999; the export walk (lookahead=0) reads no extra row and takes up to 1000, stopping at a short page.
const MAX_PAGE_SIZE = 999;
const MAX_EXPORT_PAGE_SIZE = 1000;
// endCursor of a page: the last row's height and event index
const CURSOR_RE = /^\d+:\d+$/;

function parseAddrs(param: string | null): string[] {
  if (!param) return [];
  return param
    .split(',')
    .map((s) => s.trim())
    .filter((a) => ADDRESS_RE.test(a))
    .slice(0, OWNER_ADDRESS_CAP);
}

export async function GET(req: NextRequest) {
  const addresses = parseAddrs(req.nextUrl.searchParams.get('addresses'));
  const lookahead = req.nextUrl.searchParams.get('lookahead') !== '0';
  const reqSize = Number(req.nextUrl.searchParams.get('pageSize'));
  const pageSize =
    Number.isFinite(reqSize) && reqSize > 0 ? Math.min(Math.floor(reqSize), lookahead ? MAX_PAGE_SIZE : MAX_EXPORT_PAGE_SIZE) : PAGE_SIZE;
  // after=<endCursor of the previous page> reads the rows that follow it; without it, the first page.
  const afterParam = req.nextUrl.searchParams.get('after');
  // an after that is present but empty or malformed is an error, never read as the first page
  if (afterParam !== null && !CURSOR_RE.test(afterParam)) return NextResponse.json({ error: 'invalid after cursor' }, { status: 400 });
  const after = afterParam || null;

  if (addresses.length === 0) {
    return NextResponse.json({ rows: [], hasNextPage: false } satisfies IssuancePage);
  }
  // the validated page is what is cached (30 s): an answer with `errors` or one that fails to process throws and is
  // not kept (the reads use no fetch cache)
  const result = await staleValue(
    ['owner-issuances', addresses.join(','), after ?? '', String(pageSize), lookahead ? 'pager' : 'export'],
    30,
    () => getOwnerIssuances(addresses, pageSize, after, lookahead),
  );
  return NextResponse.json(result);
}
