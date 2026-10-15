import { unstable_cache } from 'next/cache';
import { after } from 'next/server';
import type { RangeKey } from '@/lib/app-config';
import { stamped, type Envelope } from '@/lib/diagnostics';
import { WINDOW_BUCKET_MS } from '@/lib/timeranges';

// Caches of a range's data ("the last 30d") under a STABLE key (the fixed part and the range), served at once while
// stale and rebuilt behind it, one build per TTL. The value carries the instant its window ends at; one whose window
// ended more than two TTLs ago (only after a long quiet stretch: the warm cron and any visit keep it within one TTL)
// is not served: that request builds its own answer, and the cache keeps it.
//
// The stale-while-revalidate is ours, not unstable_cache's: a route handler's response does not END until the
// revalidations unstable_cache attached to it finish (Next 16.2.7, build/templates/app-route.js: it hands
// `pendingWaitUntil` to `ctx.waitUntil` and still passes it to sendResponse, and pipe-readable awaits it before `end()`),
// so its own background rebuild made the first request after a TTL wait for the whole build (1.9 s, measured).
// Here the request reads the entry as never stale, and a stale value is rebuilt in `after()`, once the response is sent.

/** A cached range value and the instant (ms) its window ends at. */
export type WindowEnvelope<T> = Envelope<T> & { windowEnd: number };

const ONE_YEAR_SECONDS = 31_536_000;

/** Whether a value whose window ends at `windowEnd` is too old to serve: more than two TTLs before `at`. A value with no
 *  window (an entry written before this cache carried one) counts as too old. */
export function tooOld(windowEnd: number | undefined, ttlSeconds: number, at: number = Date.now()): boolean {
  return !Number.isFinite(windowEnd) || at - (windowEnd as number) > 2 * ttlSeconds * 1000;
}

/**
 * The cached value while it is fresh (built within one TTL) or stale within two TTLs; past that, `build`'s. A stale
 * value calls `refresh` (with the new value when this request built one) to replace the entry after the response.
 */
export async function serveWindow<T>(
  read: () => Promise<WindowEnvelope<T>>,
  build: () => Promise<WindowEnvelope<T>>,
  refresh: (built?: WindowEnvelope<T>) => void,
  ttlSeconds: number,
  at: () => number = Date.now,
): Promise<WindowEnvelope<T>> {
  const cached = await read();
  const t = at();
  if (t - cached.__diagBuiltAt <= ttlSeconds * 1000) return cached;
  if (!tooOld(cached.windowEnd, ttlSeconds, t)) {
    refresh();
    return cached;
  }
  const built = await build();
  refresh(built);
  return built;
}

/** Keys this process is rebuilding: a stale entry is rebuilt once, however many requests read it meanwhile. */
const refreshing = new Set<string>();

/**
 * A range's value from `build(now)`, cached `ttlSeconds` under `parts` + the range. `now` is the window's end (the
 * minute, as rangeWindow floors it), passed to the builder so every part of the value reads the same window, and kept
 * with the value.
 */
export function rangeCached<T>(parts: string[], range: RangeKey, ttlSeconds: number, build: (now: number) => Promise<T>, tags?: string[]): Promise<WindowEnvelope<T>> {
  const key = [...parts, range];
  const id = key.join('\n');
  const windowed = async (): Promise<WindowEnvelope<T>> => {
    const now = Math.floor(Date.now() / WINDOW_BUCKET_MS) * WINDOW_BUCKET_MS;
    return { ...(await stamped(() => build(now))()), windowEnd: now };
  };
  // One entry per key: every call goes through this one function, so unstable_cache's key (its callback's source and
  // `key`) is the same for the read and the write. `revalidate` only decides whether unstable_cache sees the entry stale.
  const entry = (revalidate: number, produce: () => Promise<WindowEnvelope<T>>) =>
    unstable_cache(async () => produce(), key, { revalidate, tags })();
  const refresh = (built?: WindowEnvelope<T>) => {
    if (refreshing.has(id)) return;
    refreshing.add(id);
    after(async () => {
      try {
        const value = built ?? (await windowed());
        // The entry was built more than one TTL ago, so a read with half the TTL sees it stale and stores `value` in its
        // place. The write keeps that revalidate as the entry's own: half a TTL, not 1 s, in case a remote data cache
        // (Vercel's, not read here) evicts by it. Reads pass a year, so the entry's age is judged by serveWindow alone.
        await entry(Math.max(1, Math.floor(ttlSeconds / 2)), async () => value);
      } finally {
        refreshing.delete(id);
      }
    });
  };
  return serveWindow(() => entry(ONE_YEAR_SECONDS, windowed), windowed, refresh, ttlSeconds);
}
