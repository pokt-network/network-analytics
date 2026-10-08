import { NextResponse, type NextRequest } from 'next/server';
import { getOwnerRewards, getOwnerSettledClaims, getOwnerTotal, type OwnerRewards } from '@/lib/data/owner';
import type { CoverageRange } from '@/lib/data/coverage';
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
  totalPokt: number | null; // null: nothing in the range is covered yet
  totalRange: CoverageRange | null; // what the total covers (null from an indexer without the range contract)
  rewards: OwnerRewards;
  settledClaims: number | null; // in the range; null when not covered or the catalog read failed
}

export async function GET(req: NextRequest) {
  const addresses = parseAddrs(req.nextUrl.searchParams.get('addresses'));
  const rangeParam = req.nextUrl.searchParams.get('range');
  const range: RangeKey = isRangeKey(rangeParam) ? rangeParam : DEFAULT_RANGE;
  const groupAll = req.nextUrl.searchParams.get('group') === '1';

  if (addresses.length === 0) {
    return NextResponse.json({ addresses, totalPokt: 0, totalRange: null, rewards: { rows: [], addresses: [], grouped: groupAll, range: null }, settledClaims: 0 });
  }

  try {
    const [total, rewards, settled] = await Promise.all([
      getOwnerTotal(addresses, range),
      getOwnerRewards(addresses, range, groupAll),
      // the count card only: its failure shows "—" and does not take the rewards down with it
      getOwnerSettledClaims(addresses, range).catch(() => ({ count: null })),
    ]);
    return NextResponse.json({ addresses, totalPokt: total.totalPokt, totalRange: total.range, rewards, settledClaims: settled.count } satisfies OwnerResponse);
  } catch (e) {
    // An indexer without the range contract raises for a range it has not written yet; one with it still raises when
    // its rollups are stale. Either way the view shows the reason.
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
