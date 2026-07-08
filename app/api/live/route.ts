import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getStatus } from '@/lib/metadata';
import { INDEXER_LAG_THRESHOLD } from '@/lib/config';
import { NETWORK } from '@/lib/app-config';
import { getPoktPrice, type PoktPrice } from '@/lib/price';
import { getRolling24hStats } from '@/lib/data/rewards';
import { getNetInflationPctYr } from '@/lib/data/economy';

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

async function buildLive(): Promise<LivePayload> {
  const [statusRes, priceRes, rollingRes, inflationRes] = await Promise.allSettled([
    getStatus(NETWORK),
    getPoktPrice(),
    getRolling24hStats(),
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
  const rolling = rollingRes.status === 'fulfilled' ? rollingRes.value : null;

  return {
    block,
    healthy,
    lag,
    price: priceRes.status === 'fulfilled' ? priceRes.value : null,
    relays24h: rolling?.relays24h ?? null,
    cu24h: rolling?.cu24h ?? null,
    netInflation: inflationRes.status === 'fulfilled' ? inflationRes.value : null,
  };
}

export async function GET() {
  const payload = await unstable_cache(buildLive, ['live'], { revalidate: LIVE_TTL })();
  return NextResponse.json(payload);
}
