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

export function rangeWindow(range: RangeKey, now: number = Date.now()): TimeWindow {
  const spec = RANGE_SPECS[range];
  return {
    endISO: new Date(now).toISOString(),
    startISO: new Date(now - spec.seconds * 1000).toISOString(),
    prevStartISO: new Date(now - 2 * spec.seconds * 1000).toISOString(),
    interval: spec.interval,
  };
}

/** A fixed-length window ending now (e.g. trailing 3 days for 24h stat deltas). */
export function fixedWindow(seconds: number, now: number = Date.now()) {
  return {
    startISO: new Date(now - seconds * 1000).toISOString(),
    endISO: new Date(now).toISOString(),
  };
}

/** Cache TTL. Long enough that the cron warmer keeps entries fresh between runs; the 24h (hourly)
 *  window stays shorter since it moves faster. These are analytics, not real-time — minutes of
 *  staleness is fine (the live strip stays live separately). */
export function rangeTTL(range: RangeKey): number {
  return range === '24h' ? 600 : 1800;
}
