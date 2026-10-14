import { NextResponse, type NextRequest } from 'next/server';
import { getOwnerIssuances, type IssuancePage } from '@/lib/data/owner';
import { ADDRESS_RE } from '@/lib/staking/addresses';
import { OWNER_ADDRESS_CAP } from '@/lib/app-config';

const PAGE_SIZE = 25;
// Larger pages are only used by the CSV "export all" path, which walks pages client-side. The indexer's
// getClaimsList returns at most 1000 rows a call, and each page reads one row more to tell whether another follows.
const MAX_PAGE_SIZE = 999;
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
  const reqSize = Number(req.nextUrl.searchParams.get('pageSize'));
  const pageSize = Number.isFinite(reqSize) && reqSize > 0 ? Math.min(reqSize, MAX_PAGE_SIZE) : PAGE_SIZE;
  // after=<endCursor of the previous page> reads the rows that follow it; without it, the first page.
  const afterParam = req.nextUrl.searchParams.get('after');
  if (afterParam && !CURSOR_RE.test(afterParam)) return NextResponse.json({ error: 'invalid after cursor' }, { status: 400 });
  const after = afterParam || null;

  if (addresses.length === 0) {
    return NextResponse.json({ rows: [], hasNextPage: false } satisfies IssuancePage);
  }
  const result = await getOwnerIssuances(addresses, pageSize, after);
  return NextResponse.json(result);
}
