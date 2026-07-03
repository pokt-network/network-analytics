import { NextResponse, type NextRequest } from 'next/server';
import { WARM_RANGES } from '@/lib/app-config';

// Cache warmer (Vercel Cron). Pre-populates the common (tab × range) payloads so a user's first
// visit hits a warm Vercel Data Cache instead of the ~4s cold indexer path. unstable_cache is
// stale-while-revalidate, so once populated these serve instantly and refresh in the background;
// the periodic run keeps them from going cold (or evicted) between visits.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function baseUrl(): string {
  if (process.env.CRON_WARM_BASE_URL) return process.env.CRON_WARM_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

export async function GET(req: NextRequest) {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is configured.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const base = baseUrl();
  const targets = [`${base}/api/economy`, `${base}/api/services/list`];
  for (const range of WARM_RANGES) {
    targets.push(
      `${base}/api/traffic?range=${range}`,
      `${base}/api/network?range=${range}`,
      `${base}/api/suppliers?range=${range}`,
      `${base}/api/services/analytics?range=${range}`,
    );
  }

  const results = await Promise.allSettled(targets.map((u) => fetch(u, { cache: 'no-store' })));
  const warmed = results.filter((r) => r.status === 'fulfilled' && (r.value as Response).ok).length;

  return NextResponse.json({ warmed, total: targets.length, ranges: WARM_RANGES });
}
