import { NextResponse, type NextRequest } from 'next/server';
import { getOperatorClaimProofs, type ClaimProofs } from '@/lib/data/operator';
import { ADDRESS_RE } from '@/lib/staking/addresses';
import { DEFAULT_RANGE, isRangeKey, OWNER_ADDRESS_CAP, type RangeKey } from '@/lib/app-config';

function parseAddrs(param: string | null): string[] {
  if (!param) return [];
  return param.split(',').map((s) => s.trim()).filter((a) => ADDRESS_RE.test(a)).slice(0, OWNER_ADDRESS_CAP);
}

export async function GET(req: NextRequest) {
  const addresses = parseAddrs(req.nextUrl.searchParams.get('addresses'));
  const rangeParam = req.nextUrl.searchParams.get('range');
  const range: RangeKey = isRangeKey(rangeParam) ? rangeParam : DEFAULT_RANGE;
  if (addresses.length === 0) return NextResponse.json({ points: [], range: null } satisfies ClaimProofs);
  return NextResponse.json(await getOperatorClaimProofs(addresses, range));
}
