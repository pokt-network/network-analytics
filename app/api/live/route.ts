import { unstable_cache } from 'next/cache';
import { getStatus } from '@/lib/metadata';
import { INDEXER_LAG_THRESHOLD } from '@/lib/config';
import { NETWORK } from '@/lib/app-config';
import { getPoktPrice, type PoktPrice } from '@/lib/price';
import { getCachedRolling24hStats } from '@/lib/data/rewards';
import { getNetInflationPctYr } from '@/lib/data/economy';
import { diagJson, restamp, stamped } from '@/lib/diagnostics';

// Live-strip heartbeat. Server-side so the browser never hits the indexer or CMC directly.
// Polled by the LiveStrip client every 15s.
export const dynamic = 'force-dynamic';

// Micro-cache the assembled heartbeat so many concurrent sessions don't each pay the ~1.4s
// indexer+CMC round-trip. 10s < the client's 15s poll, so the strip stays effectively live while
// indexer/CMC load is bounded to one refresh per 10s regardless of traffic.
const LIVE_TTL = 10;

export interface LivePayload {
  block: number | null;
  healthy: boolean;
  lag: number | null;
  price: PoktPrice | null;
  // Wired in later phases (Traffic / Economy):
  relays24h: number | null;
  cu24h: number | null;
  netInflation: number | null;
}

/** What the 10s `live` entry stores. The rolling-24h numbers are merged in by the handler from the
 *  shared entry so the strip and the Traffic cards read the exact same value (see GET). */
type LiveBase = Omit<LivePayload, 'relays24h' | 'cu24h'>;

async function buildLive(): Promise<LiveBase> {
  const [statusRes, priceRes, inflationRes] = await Promise.allSettled([
    getStatus(NETWORK),
    getPoktPrice(),
    getNetInflationPctYr(),
  ]);

  let block: number | null = null;
  let healthy = false;
  let lag: number | null = null;
  if (statusRes.status === 'fulfilled') {
    const s = statusRes.value;
    const node = s.blocks.nodes[0];
    const target = Number(s._metadata.targetHeight);
    const lastProcessed = Number(s._metadata.lastProcessedHeight);
    lag = target - lastProcessed;
    block = Number(node?.id ?? lastProcessed);
    healthy = lag <= INDEXER_LAG_THRESHOLD;
  }
  return {
    block,
    healthy,
    lag,
    price: priceRes.status === 'fulfilled' ? priceRes.value : null,
    netInflation: inflationRes.status === 'fulfilled' ? inflationRes.value : null,
  };
}

export async function GET() {
  // Read the rolling-24h numbers from their shared entry rather than baking them into the `live`
  // entry, so the strip and the Traffic 24h cards are literally the same value, not two snapshots
  // of it taken at different times. Kept non-fatal (as the old allSettled branch was): a rolling
  // failure blanks those two items instead of failing the whole heartbeat.
  return diagJson('live', async () => {
    const [cached, rolling] = await Promise.all([
      unstable_cache(stamped(buildLive), ['live'], { revalidate: LIVE_TTL })(),
      getCachedRolling24hStats().catch(() => null),
    ]);
    const payload: LivePayload = {
      ...cached.data,
      relays24h: rolling?.relays24h ?? null,
      cu24h: rolling?.cu24h ?? null,
    };
    return restamp(cached, payload);
  });
}
