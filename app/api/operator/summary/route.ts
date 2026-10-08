import { NextResponse, type NextRequest } from 'next/server';
import { getOperatorSummary, type OperatorSummary } from '@/lib/data/operator';
import { ADDRESS_RE } from '@/lib/staking/addresses';
import { OWNER_ADDRESS_CAP } from '@/lib/app-config';

function parseAddrs(param: string | null): string[] {
  if (!param) return [];
  return param.split(',').map((s) => s.trim()).filter((a) => ADDRESS_RE.test(a)).slice(0, OWNER_ADDRESS_CAP);
}

export async function GET(req: NextRequest) {
  const addresses = parseAddrs(req.nextUrl.searchParams.get('addresses'));
  if (addresses.length === 0) {
    return NextResponse.json({ supplierCount: 0, stakedPokt: 0, rewards24hPokt: 0, rewards48hPokt: 0 } satisfies OperatorSummary);
  }
  return NextResponse.json((await getOperatorSummary(addresses)) satisfies OperatorSummary);
}
