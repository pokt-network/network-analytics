import { gqlFetch } from '@/lib/graphql';
import { NETWORK, type RangeKey } from '@/lib/app-config';
import { LAST_SETTLEMENT } from '@/lib/queries/analytics';
import { rangeWindow, type TimeWindow } from '@/lib/timeranges';
import { microsToIso, toMicros } from './coverage';
import { staleValue } from '@/lib/window-cache';

// Rewards, earnings and settled claims change only at settlement blocks. Their windows end at the last settlement, not at
// "now": the query variables then stay the same until the next settlement, so every request between two settlements is
// a cache hit, and the total is the one the chain settled. The settlement taken is the last one whose block is fully
// written (its height at or below `_metadata.lastProcessedHeight`): a settlement block can be read half written for
// ~30 s, and a window ending in it would be cached with a partial total until the next settlement.

/** A fully written settlement: its height and its block time as the indexer gives it (microseconds kept). */
export interface Settlement {
  height: number;
  blockTime: string;
}

/** Read and judged together, one shared read for every route and address set (30 s cache). */
export function settledOf(
  answer: { getLastSettlement: { height: string | number; blockTime: string } | null; _metadata: { lastProcessedHeight: number | string } | null },
  previous: Settlement | null,
): Settlement | null {
  const s = answer.getLastSettlement;
  const processed = Number(answer._metadata?.lastProcessedHeight);
  if (!s || !Number.isFinite(processed)) return previous;
  const height = Number(s.height);
  // a settlement in a block not finished yet: keep the last fully written one
  return height <= processed ? { height, blockTime: s.blockTime } : previous;
}

let lastWritten: Settlement | null = null;

/**
 * The last fully written settlement (null before the first one, or while none has been seen written yet). Cached 30 s and
 * served at once at any age while it is read again after the response: an older settlement is still a fully written one,
 * so the windows it gives are only older, never partial, and no reward read waits for this one.
 */
export async function getLastSettlement(): Promise<Settlement | null> {
  const read = async () => {
    const data = await gqlFetch<Parameters<typeof settledOf>[0]>(NETWORK, LAST_SETTLEMENT, {}, { cache: 'no-store' });
    lastWritten = settledOf(data, lastWritten);
    return lastWritten;
  };
  try {
    return await staleValue(['last-settlement'], 30, read, () => false);
  } catch (e) {
    // outside a Next server (scripts, tests) there is no cache: read it
    if (e instanceof Error && e.message.startsWith('Invariant: incrementalCache missing')) return read();
    throw e;
  }
}

/**
 * `range`'s window ending at the settlement: [T − range, T] for a function whose end is inclusive (the legacy_ ones and
 * get_overserviced), [T + 1 µs − range, T + 1 µs) for a half-open one (the catalog's), so that both read the settlement
 * block. Without a settlement, the window ending now, as before.
 */
export function settledWindow(range: RangeKey | number, settlement: Settlement | null, endInclusive: boolean): TimeWindow {
  // a fixed number of seconds uses the 24h range's bucket; only the edges are read from it then
  const base = rangeWindow(typeof range === 'number' ? '24h' : range);
  const seconds = typeof range === 'number' ? range : (Date.parse(base.endISO) - Date.parse(base.startISO)) / 1000;
  const end = settlement ? toMicros(settlement.blockTime) : null;
  if (end == null) {
    const now = Date.parse(base.endISO);
    return { ...base, startISO: new Date(now - seconds * 1000).toISOString(), prevStartISO: new Date(now - 2 * seconds * 1000).toISOString() };
  }
  const e = end + (endInclusive ? BigInt(0) : BigInt(1));
  const span = BigInt(seconds) * BigInt(1_000_000);
  return { ...base, endISO: microsToIso(e), startISO: microsToIso(e - span), prevStartISO: microsToIso(e - BigInt(2) * span) };
}
