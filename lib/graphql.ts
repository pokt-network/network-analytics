// ─────────────────────────────────────────────────────────────────────────────
// VENDORED from pnf-explorer — DO NOT EDIT HERE.
// Managed by scripts/sync-vendor.mjs. Edit upstream in the explorer repo, then re-sync.
// ─────────────────────────────────────────────────────────────────────────────

// DIVERGES from pnf-explorer feat/closed-schema 8fe9f74 in three places. First: reads in flight OUTSIDE a React render
// (this app's route handlers, which are all dynamic) share one process-wide map (`inflightReads`). pnf-explorer shares
// only within a render, where a joiner would not register its revalidate on a prerendered route; here every gqlFetch
// call runs in a dynamic route handler, where React's `cache` gives a new map on every call, so nothing would be
// shared. Measured in the built app, 3 identical cold requests at once: one upstream request per distinct read with
// this map, three without it (as many as the old fetch cache made). Second: a cached answer read more than its
// revalidate ago is returned at once and read again after the response (`refreshAfter`), where unstable_cache's own
// background read would hold a route handler's response until it finished. Its entries carry when they were read (key
// part 'read-at'). Third, which the second makes possible: while a failed read is held, a request that has a cached
// answer gets that answer (and no read is made until the hold ends), where pnf-explorer throws the held error; only a
// cache miss throws it. All three are kept here only; a re-sync from pnf-explorer would drop them, so scripts/sync-
// vendor.mjs leaves this file alone.

import { cache } from 'react';
import { getNetwork, type NetworkId } from './networks';
import { DataError } from './errors';

export type RevalidateOpt = number | false;

export interface GqlOptions {
  /** ISR revalidate seconds, or `false` for immutable data, cached for good (§3). Server-side only. */
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
 * stores nothing. One request per cache miss, as before. An answer whose only errors are on `partial` fields is returned
 * to the caller but not cached either. A failed or partial answer is held for 15 s per process and then asked again, so a
 * read that keeps failing costs one request per 15 s window (see holds). Outside a Next server (a script, a unit test)
 * there is no cache to keep it in, and the call goes straight out.
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
  // The same read already on its way in this render (generateMetadata and the page, or two panels asking alike) shares
  // that request: unstable_cache does not join a miss in flight, where Next's fetch cache did. Only within one render:
  // the read that joins does not register its revalidate on its own route (unstable_cache does that for the call that
  // runs), so a prerendered page that joined another route's read could keep its HTML for good. A call with an abort
  // signal goes its own way (still through the cache) and nobody joins it: its abort must reject it alone.
  if (opts.signal) return cachedRead<T>(network, query, variables, opts);
  const key = JSON.stringify([network, query, variables ?? null, opts.revalidate, opts.partial ?? null]);
  const inflight = inflightReads();
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const read = cachedRead<T>(network, query, variables, opts).finally(() => inflight.delete(key));
  inflight.set(key, read);
  return read;
}

/**
 * The current render's cached reads in flight, by network, query, variables and options; each removed once it settles.
 * React's `cache` keeps one Map per server render (its request scope) and makes a new one on every call outside a render,
 * where nothing is shared. Joiners get the same object: callers copy before they change a result.
 */
const renderReads = cache(() => new Map<string, Promise<unknown>>());

/** Cached reads in flight outside a render (route handlers, scripts): one map for the process. */
const processReads = new Map<string, Promise<unknown>>();

/** This render's map inside a render; outside one (`cache` gives a new map on each call there), the process's. */
function inflightReads(): Map<string, Promise<unknown>> {
  const reads = renderReads();
  return reads === renderReads() ? reads : processReads;
}

async function cachedRead<T>(network: NetworkId, query: string, variables: Record<string, unknown> | undefined, opts: GqlOptions): Promise<T> {
  // loaded here, on the server-only path: a client component that imports gqlFetch (live polling, no-store) does not
  // pull Next's cache runtime into its bundle
  const { unstable_cache } = await import('next/cache');
  const holdKey = JSON.stringify([network, query, variables ?? null, opts.partial ?? null]);
  const held = activeHold(holdKey);
  if (held?.kind === 'partial') return held.data as T;
  // The request's abort signal, dropped by a refresh that runs after the response (the request may be gone by then).
  let signal = opts.signal;
  const read = async (n: NetworkId, q: string, v: Record<string, unknown> | null): Promise<ReadAnswer<T>> => {
    // A held error is thrown only where there is no answer to serve: a cache miss lands here, a cached answer does not.
    const error = activeHold(holdKey);
    if (error?.kind === 'error') throw new DataError(error.error.message, error.error.kind, error.error.status, error.error.denyReason);
    try {
      const data = complete(await postGraphql<T>(n, q, v ?? undefined, 'no-store', signal), opts.partial);
      holds.delete(holdKey);
      return { readAt: Date.now(), data };
    } catch (e) {
      // Held here, in the callback, because a stale entry is revalidated in the background, where Next swallows the
      // throw: without the hold every request would ask again. An aborted call says nothing about the indexer.
      if (!signal?.aborted) hold(holdKey, e);
      throw e;
    }
  };
  // One entry per read and policy; `revalidate` only decides whether unstable_cache sees the entry stale.
  const entry = (revalidate: RevalidateOpt) =>
    unstable_cache(
      read,
      // The policy is part of the key. Next judges an entry's age by the revalidate of the call that reads it, so an
      // entry shared across policies would let a 15 s answer (a block not written yet) be fresh for good to a `false`
      // reader. 'read-at': the entry carries when it was read (this app's stale path, below).
      ['gqlFetch', 'read-at', String(opts.revalidate)],
      { revalidate },
    )(network, query, variables ?? null);
  try {
    if (opts.revalidate === false) return (await entry(false)).data;
    const ttl = opts.revalidate as number;
    // Read as never stale, and judge the age here: a stale answer is returned at once and read again after the response.
    // unstable_cache's own background read would hold a route handler's response until it finished.
    const got = await entry(ONE_YEAR_S);
    if (Date.now() - got.readAt <= ttl * 1000) return got.data;
    // a failed read of it is held: the last good answer is served, and read again once the hold ends
    if (activeHold(holdKey)) return got.data;
    const id = JSON.stringify([network, query, variables ?? null, ttl]);
    // The entry was read more than one TTL ago, so a read at half the TTL sees it stale and reads it again in the
    // background, which Next awaits after the callbacks; stored with that half TTL as its own revalidate.
    const scheduled = await refreshAfter(id, async () => {
      signal = undefined;
      await entry(Math.max(1, Math.floor(ttl / 2)));
    });
    // outside a request there is no after(): unstable_cache's own rule, which reads it again before answering there
    return scheduled ? got.data : (await entry(ttl)).data;
  } catch (e) {
    // A partial answer reaches its caller (and is held, above).
    if (e instanceof PartialAnswer) return e.data as T;
    if (noIncrementalCache(e)) {
      return settle(await postGraphql<T>(network, query, variables, 'no-store', opts.signal), opts.partial);
    }
    throw e;
  }
}

/** A cached answer and when (ms) it was read from the indexer. */
type ReadAnswer<T> = { readAt: number; data: T };

const ONE_YEAR_S = 31_536_000;

/** Reads this process is refreshing: a stale answer is read again once, however many requests return it meanwhile. */
const refreshing = new Set<string>();

/** Runs `refresh` after the response (once per `id` at a time); false when there is no request to run it after. */
async function refreshAfter(id: string, refresh: () => Promise<void>): Promise<boolean> {
  if (refreshing.has(id)) return true;
  const { after } = await import('next/server');
  refreshing.add(id);
  try {
    after(() => refresh().finally(() => refreshing.delete(id)));
    return true;
  } catch {
    refreshing.delete(id);
    return false;
  }
}

/** The hold on this read, if its window has not ended (an ended one is dropped). */
function activeHold(key: string) {
  const held = holds.get(key);
  if (held && held.until > Date.now()) return held;
  if (held) holds.delete(key);
  return undefined;
}

const noIncrementalCache = (e: unknown) => e instanceof Error && e.message.startsWith('Invariant: incrementalCache missing');

/** How long a failed or partial answer is served again: a read that keeps failing costs one request per window, not per render. */
const HOLD_MS = 15_000;

/**
 * Failed and partial answers by read (network, query, variables, partial), each until its window ends. Per process and
 * apart from unstable_cache, so the cache stores only complete answers and a held answer registers no revalidate on the
 * route. Within the window an error is thrown again even where a stale complete answer is cached: an error page for at
 * most 15 s, where the fetch cache served the error for the read's whole TTL.
 */
const holds = new Map<string, { until: number } & ({ kind: 'partial'; data: unknown } | { kind: 'error'; error: DataError })>();

function hold(key: string, e: unknown) {
  const now = Date.now();
  for (const [k, h] of holds) if (h.until <= now) holds.delete(k);
  if (e instanceof PartialAnswer) holds.set(key, { until: now + HOLD_MS, kind: 'partial', data: e.data });
  else if (e instanceof DataError) holds.set(key, { until: now + HOLD_MS, kind: 'error', error: e });
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
