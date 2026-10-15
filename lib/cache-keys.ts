import type { RangeKey } from '@/lib/app-config';

// Keys for caches of a range's data ("the last 30d" and the like). A route serves a stale entry as it is, however old,
// and revalidates behind it, so a key with the range name alone answers an old window after a quiet stretch. These
// keys carry the time bucket the entry belongs to, as long as the cache's TTL: a new bucket is a new key (one build per
// TTL, as before), and no entry is ever served for a window older than one TTL.

/** The start of the `ttlSeconds`-long bucket `at` falls in (aligned to the epoch, so every server agrees), in ms. */
export function windowBucketStart(ttlSeconds: number, at: number = Date.now()): number {
  const size = ttlSeconds * 1000;
  return Math.floor(at / size) * size;
}

/** A range-keyed cache's key: `parts`, the range and its TTL-long bucket; `now` is the bucket's start, the instant a
 *  builder that takes one should end its window at, so the key and the data agree. */
export function rangeCacheKey(parts: string[], range: RangeKey, ttlSeconds: number, at: number = Date.now()): { key: string[]; now: number } {
  const now = windowBucketStart(ttlSeconds, at);
  return { key: [...parts, range, new Date(now).toISOString()], now };
}
