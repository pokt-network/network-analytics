import { NextResponse, type NextRequest } from 'next/server';
import { getOwnerIssuances, type IssuancePage } from '@/lib/data/owner';
import { ADDRESS_RE } from '@/lib/owner-storage';
import { OWNER_ADDRESS_CAP } from '@/lib/app-config';

const PAGE_SIZE = 25;

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

  if (addresses.length === 0) {
    return NextResponse.json({ rows: [], totalCount: 0 } satisfies IssuancePage);
  }
  const result = await getOwnerIssuances(addresses, page, PAGE_SIZE);
  return NextResponse.json(result);
}
