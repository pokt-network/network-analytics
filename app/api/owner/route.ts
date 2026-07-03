import { NextResponse, type NextRequest } from 'next/server';
import { getOwnerRewards, getOwnerTotal, type OwnerRewards } from '@/lib/data/owner';
import { ADDRESS_RE } from '@/lib/owner-storage';
import { DEFAULT_RANGE, isRangeKey, OWNER_ADDRESS_CAP, type RangeKey } from '@/lib/app-config';

function parseAddrs(param: string | null): string[] {
  if (!param) return [];
  return param
    .split(',')
    .map((s) => s.trim())
    .filter((a) => ADDRESS_RE.test(a))
    .slice(0, OWNER_ADDRESS_CAP);
}

export interface OwnerResponse {
  addresses: string[];
  totalPokt: number;
  rewards: OwnerRewards;
}

export async function GET(req: NextRequest) {
  const addresses = parseAddrs(req.nextUrl.searchParams.get('addresses'));
  const rangeParam = req.nextUrl.searchParams.get('range');
  const range: RangeKey = isRangeKey(rangeParam) ? rangeParam : DEFAULT_RANGE;
  const groupAll = req.nextUrl.searchParams.get('group') === '1';

  if (addresses.length === 0) {
    return NextResponse.json({ addresses, totalPokt: 0, rewards: { rows: [], addresses: [], grouped: groupAll } });
  }

  const [totalPokt, rewards] = await Promise.all([
    getOwnerTotal(addresses, range),
    getOwnerRewards(addresses, range, groupAll),
  ]);
  return NextResponse.json({ addresses, totalPokt, rewards } satisfies OwnerResponse);
}
