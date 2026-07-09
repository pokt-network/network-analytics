import { NextResponse, type NextRequest } from 'next/server';
import { WARM_RANGES } from '@/lib/app-config';

// Cache warmer (Vercel Cron). Pre-populates the common (tab × range) payloads so a user's first
// visit hits a warm Vercel Data Cache instead of the ~4s cold indexer path. unstable_cache is
// stale-while-revalidate, so once populated these serve instantly and refresh in the background;
// the periodic run keeps them from going cold (or evicted) between visits.
export const dynamic = 'force-dynamic';
// Headroom above the ~24s a full cold cycle takes at WARM_CONCURRENCY (healthy indexer). Guards
// against the cron being killed mid-cycle — leaving later batches cold — when the indexer is slow.
// Well within the Pro function-duration ceiling.
export const maxDuration = 120;

// Warm in small concurrent batches rather than firing all ~22 targets at once. A single blast made
// the heaviest cold builds (suppliers / services-analytics on the wider ranges) contend on the
// indexer and occasionally exceed maxDuration, so those keys silently failed to warm each cycle and
// stayed cold. 4-at-a-time keeps indexer load sane while still finishing well inside 60s
// (6 batches × ~4s cold ≈ 24s; warm cycles are ~ms).
const WARM_CONCURRENCY = 4;

function baseUrl(): string {
  if (process.env.CRON_WARM_BASE_URL) return process.env.CRON_WARM_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

interface WarmResult {
  target: string;
  ok: boolean;
  status: number;
  ms: number;
  cache: string | null;
}

/** Fetch one target, capturing per-target outcome so a failed key is visible (never throws). */
async function warmOne(base: string, target: string): Promise<WarmResult> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${base}${target}`, { cache: 'no-store' });
    return { target, ok: res.ok, status: res.status, ms: Date.now() - t0, cache: res.headers.get('x-cache') };
  } catch {
    return { target, ok: false, status: 0, ms: Date.now() - t0, cache: null };
  }
}

export async function GET(req: NextRequest) {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is configured.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const base = baseUrl();
  const targets = ['/api/economy', '/api/services/list'];
  for (const range of WARM_RANGES) {
    targets.push(
      `/api/traffic?range=${range}`,
      `/api/network?range=${range}`,
      `/api/suppliers?range=${range}`,
      `/api/services/analytics?range=${range}`,
      `/api/economy/burnmint?range=${range}`,
    );
  }

  const results: WarmResult[] = [];
  for (let i = 0; i < targets.length; i += WARM_CONCURRENCY) {
    const batch = targets.slice(i, i + WARM_CONCURRENCY);
    results.push(...(await Promise.all(batch.map((t) => warmOne(base, t)))));
  }

  const warmed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).map((r) => ({ target: r.target, status: r.status }));

  return NextResponse.json({
    warmed,
    total: targets.length,
    failed,
    concurrency: WARM_CONCURRENCY,
    ranges: WARM_RANGES,
    results,
  });
}
