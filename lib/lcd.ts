// ─────────────────────────────────────────────────────────────────────────────
// VENDORED from pnf-explorer — DO NOT EDIT HERE.
// Managed by scripts/sync-vendor.mjs. Edit upstream in the explorer repo, then re-sync.
// ─────────────────────────────────────────────────────────────────────────────

import { getNetwork, type NetworkId } from './networks';
import { DataError } from './errors';

interface FetchOpts {
  revalidate?: number | false;
  cache?: RequestCache;
  signal?: AbortSignal;
}

async function jsonFetch<T>(base: string, path: string, opts: FetchOpts): Promise<T> {
  const init: RequestInit & { next?: { revalidate?: number | false } } = { signal: opts.signal };
  if (opts.cache) init.cache = opts.cache;
  else if (opts.revalidate === false) init.cache = 'force-cache';
  else if (typeof opts.revalidate === 'number') init.next = { revalidate: opts.revalidate };

  let res: Response;
  try {
    res = await fetch(base + path, init);
  } catch (e) {
    throw new DataError(`Network error reaching ${base}: ${(e as Error).message}`, 'network');
  }

  if (res.status === 404) {
    throw new DataError(`Not found on chain: ${path}`, 'not-found', 404);
  }
  if (!res.ok) {
    const denyReason = res.headers.get('x-deny-reason') ?? undefined;
    // 5xx on a tip tx often means "not yet indexed by the LCD node" — callers may treat
    // this as a transient/indexing state rather than a hard error (DATA-CONTRACT §7).
    throw new DataError(
      denyReason ? `LCD request denied: ${denyReason}` : `LCD responded ${res.status}`,
      'server',
      res.status,
      denyReason,
    );
  }
  return (await res.json()) as T;
}

/** Cosmos LCD (REST). Always-LCD content + indexer fallback (§2). Server-side only. */
export function lcdFetch<T>(network: NetworkId, path: string, opts: FetchOpts = {}): Promise<T> {
  return jsonFetch<T>(getNetwork(network).lcd, path, opts);
}

/** Tendermint RPC. Block fallback when the indexer lags (§2). Server-side only. */
export function rpcFetch<T>(network: NetworkId, path: string, opts: FetchOpts = {}): Promise<T> {
  return jsonFetch<T>(getNetwork(network).rpc, path, opts);
}
