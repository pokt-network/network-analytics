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
  /** Top-level fields (aliases) whose errors are tolerated: the answer comes back with them null and the error is
   *  logged. An error on any other field still throws. */
  partial?: string[];
}

/**
 * Typed POST to a network's GraphQL indexer with a per-call cache policy (§3 — no global default).
 * `network` selects the endpoint (registry in `lib/networks.ts`) and keeps ISR cache keys distinct.
 * Pass `revalidate` for ISR/immutable data; pass `cache:'no-store'` for live client polling.
 *
 * What a `revalidate` call caches is the validated `data`, never the HTTP response. PostGraphile answers a failed query
 * (a RAISE, a statement timeout) with HTTP 200 and `errors`, and Next's fetch cache stores any 200 (patch-fetch:
 * `res.status === 200` before the body is read), so a cached fetch kept that error for its whole TTL — for good with
 * `revalidate: false`. Here the request goes out with no fetch cache inside `unstable_cache`, which stores a result
 * only once its callback has returned: a callback that throws (errors in the body, a non-2xx status, a network error)
 * stores nothing, and the next call asks again. One request per cache miss, as before. An answer whose only errors are
 * on `partial` fields is returned to the caller but not cached either: it is not the complete answer. Outside a Next
 * server (a script, a unit test) there is no cache to keep it in, and the call goes straight out.
 */
export async function gqlFetch<T>(
  network: NetworkId,
  query: string,
  variables?: Record<string, unknown>,
  opts: GqlOptions = {},
): Promise<T> {
  if (opts.cache || (opts.revalidate !== false && typeof opts.revalidate !== 'number')) {
    return settle(await postGraphql<T>(network, query, variables, opts.cache, opts.signal), opts.partial);
  }
  // The same read already on its way (generateMetadata and the page, or two panels asking alike) shares that request:
  // unstable_cache does not join a miss in flight, where Next's fetch cache did. A call with an abort signal goes its own
  // way (still through the cache) and nobody joins it: its abort must reject it alone.
  if (opts.signal) return cachedRead<T>(network, query, variables, opts);
  const key = JSON.stringify([network, query, variables ?? null, opts.revalidate, opts.partial ?? null]);
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const read = cachedRead<T>(network, query, variables, opts).finally(() => inflight.delete(key));
  inflight.set(key, read);
  return read;
}

/** Cached reads in flight, by network, query, variables and options; each removed once it settles. */
const inflight = new Map<string, Promise<unknown>>();

async function cachedRead<T>(network: NetworkId, query: string, variables: Record<string, unknown> | undefined, opts: GqlOptions): Promise<T> {
  // loaded here, on the server-only path: a client component that imports gqlFetch (live polling, no-store) does not
  // pull Next's cache runtime into its bundle
  const { unstable_cache } = await import('next/cache');
  const cached = unstable_cache(
    async (n: NetworkId, q: string, v: Record<string, unknown> | null) =>
      complete(await postGraphql<T>(n, q, v ?? undefined, 'no-store', opts.signal), opts.partial),
    ['gqlFetch'],
    { revalidate: opts.revalidate },
  );
  try {
    return await cached(network, query, variables ?? null);
  } catch (e) {
    // A partial answer reaches its caller uncached.
    if (e instanceof PartialAnswer) return e.data as T;
    if (e instanceof Error && e.message.startsWith('Invariant: incrementalCache missing')) {
      return settle(await postGraphql<T>(network, query, variables, 'no-store', opts.signal), opts.partial);
    }
    throw e;
  }
}

type GqlError = { message: string; path?: (string | number)[] };
type Answer<T> = { data?: T; errors?: GqlError[] };

/** Thrown out of the cached callback to hand back an answer with tolerated errors without caching it. */
class PartialAnswer extends Error {
  constructor(readonly data: unknown) {
    super('Indexer partial answer');
  }
}

/**
 * The answer's data, or a throw: any error outside `partial` (or with no data at all) is a DataError; errors only on
 * `partial` top-level fields are logged and the data comes back with those fields null.
 */
function settle<T>(answer: Answer<T>, partial: string[] | undefined): T {
  if (!answer.errors?.length) return answer.data as T;
  const tolerated = partial ?? [];
  const fatal = answer.errors.filter((e) => !(e.path && tolerated.includes(String(e.path[0]))));
  if (fatal.length > 0 || answer.data == null) {
    throw new DataError(answer.errors.map((e) => e.message).join('; '), 'graphql');
  }
  console.error(`Indexer partial answer, ${answer.errors.map((e) => `${(e.path ?? []).join('.')}: ${e.message}`).join('; ')}`);
  return answer.data;
}

/** As `settle`, for the cached path: only a complete answer returns (and is cached); a partial one is thrown as such. */
function complete<T>(answer: Answer<T>, partial: string[] | undefined): T {
  const data = settle(answer, partial);
  if (answer.errors?.length) throw new PartialAnswer(data);
  return data;
}

/** One POST, its transport errors thrown: a non-2xx status (with the reason the body gives), a network error. */
async function postGraphql<T>(
  network: NetworkId,
  query: string,
  variables: Record<string, unknown> | undefined,
  cache: RequestCache | undefined,
  signal: AbortSignal | undefined,
): Promise<Answer<T>> {
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

  return (await res.json()) as Answer<T>;
}
