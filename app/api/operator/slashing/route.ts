import { NextResponse, type NextRequest } from 'next/server';
import { staleValue } from '@/lib/window-cache';
import { getOperatorSlashPage, getOperatorSlashTotals, slashCacheKeys, type SlashPage } from '@/lib/data/operator';
import { ADDRESS_RE } from '@/lib/staking/addresses';
import { DEFAULT_RANGE, isRangeKey, OWNER_ADDRESS_CAP, type RangeKey } from '@/lib/app-config';

const PAGE_SIZE = 25;
// the indexer returns at most 1000 rows a call. A pager page reads one row more to tell whether another follows, so it
// takes up to 999; the export walk (lookahead=0) reads no extra row and takes up to 1000, stopping at a short page.
const MAX_PAGE_SIZE = 999;
const MAX_EXPORT_PAGE_SIZE = 1000;
// endCursor of a page: the last row's height and id; an event id is `<tx hash or height>-<event kind>-<index>`
// (pocketdex getEventId; slashes are `<height>-finalize_block-<index>`)
const CURSOR_RE = /^\d+:[0-9A-Fa-f]+-[a-z_]+-\d+$/;

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
  // The window is pinned by the SERVER: a walk's first page (no `at`) takes the current minute and returns it as `at`;
  // its later pages and the export's probe send that `at` back, so the whole walk reads one window. An `at` is accepted
  // only as a whole minute that has already started and is at most an hour old (each value is a cache key; a browser
  // clock plays no part).
  const now = Date.now();
  const atParam = req.nextUrl.searchParams.get('at');
  let at = now;
  if (atParam !== null) {
    const v = Number(atParam);
    if (!(/^\d+$/.test(atParam) && v % 60_000 === 0 && v <= now && v >= now - 3_600_000)) {
      return NextResponse.json({ error: 'This page belongs to a window that is over an hour old or invalid: start again from page 1.' }, { status: 400 });
    }
    at = v;
  }

  if (addresses.length === 0) {
    return NextResponse.json({
      rows: [], hasNextPage: false, endCursor: null, indexed: true, range: null, totalCount: 0, penaltyUpokt: '0', capped: false,
    } satisfies SlashPage);
  }
  // both keys carry the pinned minute (slashCacheKeys), and the functions read that same window
  const keys = slashCacheKeys(addresses, range, { after, pageSize, lookahead }, at);
  const [totals, page] = await Promise.all([
    // 60 s: the key changes with the window's 60 s bucket, so a longer TTL would never be reached
    // the export walk (no lookahead) writes only the rows: it does not wait for the range's totals
    lookahead
      ? staleValue(keys.totals, 60, () => getOperatorSlashTotals(addresses, range, keys.now))
      : Promise.resolve({ totalCount: 0, penaltyUpokt: '0', capped: false }),
    // the validated page is what is cached (60 s): an answer with `errors` or one that fails to process throws and is
    // not kept (the reads use no fetch cache)
    staleValue(keys.page, 60, () => getOperatorSlashPage(addresses, range, pageSize, after, lookahead, keys.now)),
  ]);
  return NextResponse.json({ ...page, ...totals, at: keys.now } satisfies SlashPage);
}
