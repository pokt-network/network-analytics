import { NextResponse, type NextRequest } from 'next/server';
import { getOwnerIssuances, type IssuancePage } from '@/lib/data/owner';
import { ADDRESS_RE } from '@/lib/owner-storage';
import { OWNER_ADDRESS_CAP } from '@/lib/app-config';

const PAGE_SIZE = 25;
// Larger pages are only used by the CSV "export all" path, which walks pages client-side. The indexer
// (PostGraphile) caps `first` at 1000.
const MAX_PAGE_SIZE = 1000;

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
  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page')) || 1);
  const reqSize = Number(req.nextUrl.searchParams.get('pageSize'));
  const pageSize = Number.isFinite(reqSize) && reqSize > 0 ? Math.min(reqSize, MAX_PAGE_SIZE) : PAGE_SIZE;
  // count=1 adds totalCount: a count over every settlement of the owners, ~15 s for a large one, so nothing asks for it
  // by default (the view shows the range's count from the catalog and pages by full pages).
  const withCount = req.nextUrl.searchParams.get('count') === '1';
  // after=<endCursor of the previous page> reads the rows that follow it (the export), instead of `page`.
  const after = req.nextUrl.searchParams.get('after') || null;

  if (addresses.length === 0) {
    return NextResponse.json({ rows: [], totalCount: 0 } satisfies IssuancePage);
  }
  const result = await getOwnerIssuances(addresses, page, pageSize, withCount, after);
  return NextResponse.json(result);
}
