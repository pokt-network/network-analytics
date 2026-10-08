// Range → concrete (start, end, prevStart, interval) windows for the indexer resolvers.
// `end` is "now"; `prevStart` gives the equal-length previous period (for change-vs-prev resolvers).
import { RANGE_SPECS, type RangeKey } from '@/lib/app-config';

export interface TimeWindow {
  startISO: string;
  endISO: string;
  /** start of the equal-length previous period (for servicesPerformanceBetweenTimes). */
  prevStartISO: string;
  interval: 'hour' | 'day' | 'week';
}

/** Window edges are quantized to this bucket so successive builds send the indexer *identical*
 *  timestamps within the bucket. Raw `Date.now()` (ms resolution) gave every rebuild a unique
 *  start/end, which defeated the inner `next:{revalidate}` fetch cache (keyed on request body) and
 *  any indexer-side caching — making every cold build maximally expensive. 60s keeps the data
 *  effectively live (analytics already tolerate minutes of staleness) while collapsing the key space. */
export const WINDOW_BUCKET_MS = 60_000;

export function rangeWindow(range: RangeKey, now: number = Date.now()): TimeWindow {
  const spec = RANGE_SPECS[range];
  // Floor `now` to the bucket so `end` only advances once per bucket, not every millisecond.
  const t = Math.floor(now / WINDOW_BUCKET_MS) * WINDOW_BUCKET_MS;
  return {
    endISO: new Date(t).toISOString(),
    startISO: new Date(t - spec.seconds * 1000).toISOString(),
    prevStartISO: new Date(t - 2 * spec.seconds * 1000).toISOString(),
    interval: spec.interval,
  };
}

/** A fixed-length window ending now (e.g. trailing 3 days for 24h stat deltas). Bucketed like
 *  `rangeWindow` so repeated builds hit the same inner fetch/indexer cache entries. */
export function fixedWindow(seconds: number, now: number = Date.now()) {
  const t = Math.floor(now / WINDOW_BUCKET_MS) * WINDOW_BUCKET_MS;
  return {
    startISO: new Date(t - seconds * 1000).toISOString(),
    endISO: new Date(t).toISOString(),
  };
}

/** Whole UTC days: from `days` days before today's 00:00Z to tomorrow's 00:00Z. For resolvers that
 *  return one point per day this gives the same points as a window ending now, but the edges move once
 *  a day instead of once a minute, so the inner fetch cache (keyed on request body) is actually reused. */
export function dayWindow(days: number, now: number = Date.now()) {
  const day = Math.floor(now / 86_400_000) * 86_400_000;
  return {
    startISO: new Date(day - days * 86_400_000).toISOString(),
    endISO: new Date(day + 86_400_000).toISOString(),
  };
}

/** Cache TTL. Long enough that the cron warmer keeps entries fresh between runs; the 24h (hourly)
 *  window stays shorter since it moves faster. These are analytics, not real-time — minutes of
 *  staleness is fine (the live strip stays live separately). */
export function rangeTTL(range: RangeKey): number {
  return range === '24h' ? 600 : 1800;
}
