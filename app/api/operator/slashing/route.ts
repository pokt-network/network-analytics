import { NextResponse, type NextRequest } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getOperatorSlashes, type SlashList } from '@/lib/data/operator';
import { ADDRESS_RE } from '@/lib/staking/addresses';
import { DEFAULT_RANGE, isRangeKey, OWNER_ADDRESS_CAP, type RangeKey } from '@/lib/app-config';

function parseAddrs(param: string | null): string[] {
  if (!param) return [];
  return param.split(',').map((s) => s.trim()).filter((a) => ADDRESS_RE.test(a)).slice(0, OWNER_ADDRESS_CAP);
}

// Every slashing event of the range in one answer, cached whole (one read): the view pages these rows and the CSV
// exports them, so the page count, Next and the export all come from the same rows.
export async function GET(req: NextRequest) {
  const addresses = parseAddrs(req.nextUrl.searchParams.get('addresses'));
  const rangeParam = req.nextUrl.searchParams.get('range');
  const range: RangeKey = isRangeKey(rangeParam) ? rangeParam : DEFAULT_RANGE;

  if (addresses.length === 0) {
    return NextResponse.json({ rows: [], totalCount: 0, penaltyUpokt: '0', indexed: true, range: null, complete: true } satisfies SlashList);
  }
  const list = await unstable_cache(() => getOperatorSlashes(addresses, range), ['operator-slashing', addresses.join(','), range], {
    revalidate: 300,
  })();
  return NextResponse.json(list);
}
