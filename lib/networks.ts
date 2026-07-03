// ─────────────────────────────────────────────────────────────────────────────
// VENDORED from pnf-explorer — DO NOT EDIT HERE.
// Managed by scripts/sync-vendor.mjs. Edit upstream in the explorer repo, then re-sync.
// ─────────────────────────────────────────────────────────────────────────────

// Network registry (§5). The explorer serves more than one Pocket Network chain; the active
// network is carried in the URL path prefix and threaded explicitly into every data call so
// per-network ISR cache keys stay distinct (we never read a dynamic request API in the fetchers).
//
// URL model: the DEFAULT network (mainnet) is prefix-less (`/block/1`); every other network is
// prefixed (`/beta/block/1`). `proxy.ts` rewrites prefix-less requests onto the default segment.

/** Canonical network ids. These are also the URL path segments for non-default networks. */
export const NETWORK_IDS = ['main', 'beta'] as const;
export type NetworkId = (typeof NETWORK_IDS)[number];

export const DEFAULT_NETWORK: NetworkId = 'main';

export interface NetworkConfig {
  /** Stable id (also the route segment for non-default networks). */
  id: NetworkId;
  /** Human label for the switcher + UI. */
  label: string;
  /** Short tag shown in compact spots (e.g. the AppBar pill). */
  short: string;
  /** True for the prefix-less default network (mainnet). */
  isDefault: boolean;
  /** GraphQL indexer (public — the browser polls it, so this is a NEXT_PUBLIC value). */
  graphql: string;
  /** Cosmos LCD/REST base (server-side only). */
  lcd: string;
  /** Tendermint RPC base (server-side only). */
  rpc: string;
}

// Endpoints stay individually env-overridable (Vercel). The original single-network vars are
// honoured as the mainnet defaults for backward compatibility; *_BETA vars override betanet.
export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  main: {
    id: 'main',
    label: 'Mainnet',
    short: 'Mainnet',
    isDefault: true,
    graphql: process.env.NEXT_PUBLIC_GRAPHQL_URL ?? 'https://data.pocket.network/graphql',
    lcd: process.env.SAURON_LCD_URL ?? 'https://sauron-api.infra.pocket.network',
    rpc: process.env.SAURON_RPC_URL ?? 'https://sauron-rpc.infra.pocket.network',
  },
  beta: {
    id: 'beta',
    label: 'Beta TestNet',
    short: 'Beta',
    isDefault: false,
    graphql: process.env.NEXT_PUBLIC_GRAPHQL_URL_BETA ?? 'https://data.beta.pocket.network/graphql',
    lcd: process.env.SAURON_LCD_URL_BETA ?? 'https://sauron-api.beta.infra.pocket.network',
    rpc: process.env.SAURON_RPC_URL_BETA ?? 'https://sauron-rpc.beta.infra.pocket.network',
  },
};

/** Ordered list for rendering the switcher (default first). */
export const NETWORK_LIST: NetworkConfig[] = NETWORK_IDS.map((id) => NETWORKS[id]);

/** Type guard: is `value` a known network id? */
export function isNetwork(value: string | undefined | null): value is NetworkId {
  return value != null && (NETWORK_IDS as readonly string[]).includes(value);
}

/** Resolve a network id to its config, falling back to the default for unknown input. */
export function getNetwork(id: string | undefined | null): NetworkConfig {
  return isNetwork(id) ? NETWORKS[id] : NETWORKS[DEFAULT_NETWORK];
}

/** URL path prefix for a network: '' for the default, '/beta' otherwise. */
export function networkPrefix(id: NetworkId): string {
  return NETWORKS[id].isDefault ? '' : `/${id}`;
}

/**
 * Build an in-app href for `path` under `network`. `path` is the network-agnostic path
 * (e.g. '/block/1' or '/'); the network prefix is prepended for non-default networks.
 */
export function netHref(network: NetworkId, path: string): string {
  const prefix = networkPrefix(network);
  if (!prefix) return path;
  // Avoid '/beta/' for the home path — collapse '/' to the bare prefix.
  if (path === '/') return prefix;
  return `${prefix}${path.startsWith('/') ? '' : '/'}${path}`;
}
