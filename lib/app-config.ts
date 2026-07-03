// Analytics-app constants (single mainnet network; no [network] routing).
import type { NetworkId } from '@/lib/networks';

/** The only network analytics serves in v1. Kept as a constant so vendored `gqlFetch(network,…)`
 *  signatures stay intact without building the explorer's multi-network routing. */
export const NETWORK: NetworkId = 'main';

/** Sibling explorer — the single crossover point (reward-issuance rows link out to a tx). */
export const EXPLORER_BASE_URL =
  process.env.NEXT_PUBLIC_EXPLORER_BASE_URL ?? 'https://explorer.pocket.network';

/** Owner Staking address cap (v1 = 10, matches PoktScan). A config constant, NOT a hardcoded
 *  assumption — batching, storage schema, and UI must not assume exactly this number
 *  (larger-node observability is a candidate paid tier later). */
export const OWNER_ADDRESS_CAP = 10;

export type RangeKey = '24h' | '7d' | '30d' | '60d';
export const RANGE_KEYS: RangeKey[] = ['24h', '7d', '30d', '60d'];
export const DEFAULT_RANGE: RangeKey = '7d';

export interface RangeSpec {
  key: RangeKey;
  label: string;
  /** Window length in seconds (end = now). */
  seconds: number;
  /** Postgres date_trunc bucket the indexer resolvers take. */
  interval: 'hour' | 'day' | 'week';
}

// Range → (window, truncInterval). One finite set of cache keys (brief §3).
export const RANGE_SPECS: Record<RangeKey, RangeSpec> = {
  '24h': { key: '24h', label: '24h', seconds: 24 * 3600, interval: 'hour' },
  '7d': { key: '7d', label: '7d', seconds: 7 * 86400, interval: 'day' },
  '30d': { key: '30d', label: '30d', seconds: 30 * 86400, interval: 'day' },
  '60d': { key: '60d', label: '60d', seconds: 60 * 86400, interval: 'day' },
};

export function isRangeKey(v: string | null | undefined): v is RangeKey {
  return v != null && (RANGE_KEYS as string[]).includes(v);
}

/** Series palette for multi-line/donut charts. Network total uses the neutral gray. */
export const NETWORK_TOTAL_COLOR = '#8e9aa3';
export const SERIES_COLORS = [
  '#ff5a5f', // coral
  '#48e5c2', // mint
  '#ffc547', // gold
  '#b8b8ff', // lavender
  '#4c9bf5', // blue-soft
  '#025af2', // blue
  '#f78fb3',
  '#6ad7a8',
  '#e0a458',
  '#9f8fff',
  '#39a0ed',
  '#f25f5c',
];
