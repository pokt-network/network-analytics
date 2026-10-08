import { NextResponse, type NextRequest } from 'next/server';
import { getOwnerSummary, type OwnerSummary } from '@/lib/data/owner';
import { ADDRESS_RE } from '@/lib/staking/addresses';
import { OWNER_ADDRESS_CAP } from '@/lib/app-config';

// Owner fleet summary (supplier count + combined stake). Range-independent, so it's a separate
// endpoint from /api/owner — these cards stay stable across range/group toggles.
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
  if (addresses.length === 0) {
    return NextResponse.json({ supplierCount: 0, stakedPokt: 0 } satisfies OwnerSummary);
  }
  const summary = await getOwnerSummary(addresses);
  return NextResponse.json(summary satisfies OwnerSummary);
}
