// ─────────────────────────────────────────────────────────────────────────────
// VENDORED from pnf-explorer — DO NOT EDIT HERE.
// Managed by scripts/sync-vendor.mjs. Edit upstream in the explorer repo, then re-sync.
// ─────────────────────────────────────────────────────────────────────────────

import { getNetwork, type NetworkId } from './networks';
import { DataError } from './errors';

export type RevalidateOpt = number | false;

export interface GqlOptions {
  /** ISR revalidate seconds, or `false` for immutable/force-cache (§3). Server-side only. */
  revalidate?: RevalidateOpt;
  /** Override fetch cache mode (e.g. 'no-store' for client polling / live heartbeat). */
  cache?: RequestCache;
  signal?: AbortSignal;
}

/**
 * Typed POST to a network's GraphQL indexer with a per-call cache policy (§3 — no global default).
 * `network` selects the endpoint (registry in `lib/networks.ts`) and keeps ISR cache keys distinct.
 * Pass `revalidate` for ISR/immutable data; pass `cache:'no-store'` for live client polling.
 */
export async function gqlFetch<T>(
  network: NetworkId,
  query: string,
  variables?: Record<string, unknown>,
  opts: GqlOptions = {},
): Promise<T> {
  const init: RequestInit & { next?: { revalidate?: RevalidateOpt } } = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: opts.signal,
  };

  if (opts.cache) {
    init.cache = opts.cache;
  } else if (opts.revalidate === false) {
    init.cache = 'force-cache';
  } else if (typeof opts.revalidate === 'number') {
    init.next = { revalidate: opts.revalidate };
  }

  let res: Response;
  try {
    res = await fetch(getNetwork(network).graphql, init);
  } catch (e) {
    throw new DataError(`Network error reaching the indexer: ${(e as Error).message}`, 'network');
  }

  if (!res.ok) {
    const denyReason = res.headers.get('x-deny-reason') ?? undefined;
    throw new DataError(
      denyReason ? `Indexer request denied: ${denyReason}` : `Indexer responded ${res.status}`,
      'server',
      res.status,
      denyReason,
    );
  }

  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) {
    throw new DataError(json.errors.map((e) => e.message).join('; '), 'graphql');
  }
  return json.data as T;
}
