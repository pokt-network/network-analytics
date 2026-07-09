import { type NextRequest } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getBurnMint, getMintRatio, type BurnMintPoint } from '@/lib/data/economy';
import { rangeWindow, rangeTTL } from '@/lib/timeranges';
import { DEFAULT_RANGE, isRangeKey, warmTag, type RangeKey } from '@/lib/app-config';
import { diagJson, stamped } from '@/lib/diagnostics';

// Burn vs Mint is the one Economy widget that IS windowed, so it follows the global range pills
// (the rest — supply history, projection, composition, net inflation — are long-horizon and don't).
export interface BurnMintResponse {
  range: RangeKey;
  series: BurnMintPoint[];
  burnTotalPokt: number;
  mintTotalPokt: number;
  mintRatio: number;
}

async function buildBurnMint(range: RangeKey): Promise<BurnMintResponse> {
  const mintRatio = await getMintRatio();
  const w = rangeWindow(range);
  const series = await getBurnMint(w.startISO, w.endISO, w.interval, mintRatio, rangeTTL(range));
  const burnTotalPokt = series.reduce((s, p) => s + p.burnPokt, 0);
  const mintTotalPokt = series.reduce((s, p) => s + p.mintPokt, 0);
  return { range, series, burnTotalPokt, mintTotalPokt, mintRatio };
}

export async function GET(req: NextRequest) {
  const rangeParam = req.nextUrl.searchParams.get('range');
  const range: RangeKey = isRangeKey(rangeParam) ? rangeParam : DEFAULT_RANGE;
  return diagJson('economy-burnmint', () =>
    unstable_cache(stamped(() => buildBurnMint(range)), ['economy-burnmint', range], {
      revalidate: rangeTTL(range),
      tags: warmTag(range),
    })(),
  );
}
