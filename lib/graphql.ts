// ─────────────────────────────────────────────────────────────────────────────
// VENDORED from pnf-explorer — DO NOT EDIT HERE.
// Managed by scripts/sync-vendor.mjs. Edit upstream in the explorer repo, then re-sync.
// ─────────────────────────────────────────────────────────────────────────────

import { unstable_cache } from 'next/cache';
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
 *
 * What a `revalidate` call caches is the validated `data`, never the HTTP response. PostGraphile answers a failed query
 * (a RAISE, a statement timeout) with HTTP 200 and `errors`, and Next's fetch cache stores any 200 (patch-fetch:
 * `res.status === 200` before the body is read), so a cached fetch kept that error for its whole TTL. Here the request
 * goes out with no fetch cache inside `unstable_cache`, which stores a result only once its callback has returned:
 * a callback that throws (errors in the body, a non-2xx status, a network error) stores nothing, and the next call asks
 * again. One request per cache miss, as before. Outside a Next server (a script, a unit test) there is no cache to keep
 * it in, and the call goes straight out.
 */
export async function gqlFetch<T>(
  network: NetworkId,
  query: string,
  variables?: Record<string, unknown>,
  opts: GqlOptions = {},
): Promise<T> {
  if (opts.cache || (opts.revalidate !== false && typeof opts.revalidate !== 'number')) {
    return postGraphql<T>(network, query, variables, opts.cache, opts.signal);
  }
  const cached = unstable_cache(
    (n: NetworkId, q: string, v: Record<string, unknown> | null) => postGraphql<T>(n, q, v ?? undefined, 'no-store', opts.signal),
    ['gqlFetch'],
    { revalidate: opts.revalidate },
  );
  try {
    return await cached(network, query, variables ?? null);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Invariant: incrementalCache missing')) {
      return postGraphql<T>(network, query, variables, 'no-store', opts.signal);
    }
    throw e;
  }
}

/** One POST, its errors thrown: a non-2xx status (with the reason the body gives), a network error, `errors` in a 200. */
async function postGraphql<T>(
  network: NetworkId,
  query: string,
  variables: Record<string, unknown> | undefined,
  cache: RequestCache | undefined,
  signal: AbortSignal | undefined,
): Promise<T> {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal,
  };
  if (cache) init.cache = cache;

  let res: Response;
  try {
    res = await fetch(getNetwork(network).graphql, init);
  } catch (e) {
    throw new DataError(`Network error reaching the indexer: ${(e as Error).message}`, 'network');
  }

  if (!res.ok) {
    const denyReason = res.headers.get('x-deny-reason') ?? undefined;
    // A GraphQL validation error (bad variable, unknown field) comes back as 400 WITH the reason in
    // the body. Read it — throwing on status alone turns a one-line "variable $x of non-null type
    // was not provided" into an unattributable 400.
    let detail = '';
    try {
      const body = (await res.json()) as { errors?: { message: string }[] };
      if (body.errors?.length) detail = `: ${body.errors.map((e) => e.message).join('; ')}`;
    } catch {
      /* non-JSON body — status alone is all we get */
    }
    throw new DataError(
      denyReason ? `Indexer request denied: ${denyReason}` : `Indexer responded ${res.status}${detail}`,
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
