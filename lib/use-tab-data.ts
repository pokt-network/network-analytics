'use client';

import { useEffect, useState } from 'react';
import { beginRequest, endRequest } from './loading-store';
import { RANGE_KEYS } from './app-config';

interface State<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

// ── Module-level SWR-lite cache ──────────────────────────────────────────────
// The route handlers are already cached server-side (unstable_cache), so a warm hit is ~10ms. But
// every range/tab switch still paid a fresh round-trip *and* showed no feedback. This layer:
//   • caches responses per-URL so revisiting a range is instant (no skeleton, no refetch flash),
//   • dedupes concurrent fetches of the same URL,
//   • silently revalidates stale entries in the background, and
//   • prefetches sibling ranges after a load so the *first* range toggle is already warm — but only
//     when the primary was a cache HIT (see maybePrefetchSiblings).
type CacheState = 'HIT' | 'MISS' | null;

interface CacheEntry {
  ts: number;
  data: unknown;
  /** `x-cache` from the response — lets us skip sibling prefetch when the primary was a cold MISS. */
  cache: CacheState;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

/** How long a cached entry is served without a background revalidate. Analytics tolerate minutes of
 *  staleness (matches the server TTLs); this just avoids re-hitting the network on every switch. */
const STALE_MS = 60_000;

/** The shared, deduped, cache-writing fetch. Never touches the loading indicator itself. */
function fetchShared(url: string): Promise<unknown> {
  const existing = inflight.get(url);
  if (existing) return existing;

  const p = fetch(url)
    .then(async (r) => {
      if (!r.ok) {
        // Routes that catch their own failures send { error } with the reason; show it when present.
        const body = (await r.json().catch(() => null)) as { error?: unknown } | null;
        throw new Error(typeof body?.error === 'string' ? body.error : `Request failed (${r.status})`);
      }
      const cacheState = (r.headers.get('x-cache') as CacheState) ?? null;
      const json = await r.json();
      cache.set(url, { ts: Date.now(), data: json, cache: cacheState });
      return json;
    })
    .finally(() => {
      inflight.delete(url);
    });

  inflight.set(url, p);
  return p;
}

/**
 * Fetch + cache a URL, deduping concurrent callers.
 * `visible` drives the global loading indicator. It brackets *every* visible call (even one that
 * piggybacks on an in-flight silent prefetch), so a user who toggles a range mid-prefetch still sees
 * the indicator. Silent background work (`visible=false`) never touches the indicator.
 */
function fetchJson(url: string, visible: boolean): Promise<unknown> {
  if (!visible) return fetchShared(url);
  beginRequest();
  return fetchShared(url).finally(endRequest);
}

/**
 * Warm an endpoint in the background so a later useTabData(url) paints from cache instead of waiting.
 * Idempotent and indicator-free: a no-op when the URL is already cached or in flight. Used to eagerly
 * warm a tool's tabs in parallel once its inputs are known, so switching tabs feels instant even when
 * the underlying indexer aggregation is slow on a cold miss.
 */
export function prefetch(url: string): void {
  if (!url || cache.has(url) || inflight.has(url)) return;
  fetchShared(url).catch(() => {});
}

/** Warm the same endpoint for the other ranges so a range toggle hits a warm client+server cache. */
function prefetchSiblingRanges(url: string): void {
  const m = url.match(/[?&]range=([^&]+)/);
  if (!m) return;
  const current = m[1];
  for (const k of RANGE_KEYS) {
    if (k === current) continue;
    const sibling = url.replace(/([?&]range=)[^&]+/, `$1${k}`);
    if (cache.has(sibling) || inflight.has(sibling)) continue;
    fetchJson(sibling, false).catch(() => {});
  }
}

/** Prefetch siblings, but skip when the primary was a confirmed cold MISS. Its siblings are almost
 *  certainly cold too, and firing 3 more concurrent indexer builds is the worst thing to do while the
 *  indexer is already the bottleneck (a cold first paint would be 4 builds instead of 1). The warmer
 *  — or an explicit range click — populates them instead. HIT or unknown primaries prefetch as
 *  before, keeping range toggles instant in the warm steady state. */
function maybePrefetchSiblings(url: string): void {
  if (cache.get(url)?.cache === 'MISS') return;
  prefetchSiblingRanges(url);
}

/**
 * Fetch JSON from an internal route handler, refetching when `url` changes.
 * Serves cached data instantly on revisit, keeps prior data visible during a cold fetch (cleared if it fails), and reports
 * visible fetches to the global loading store so the shell can indicate activity.
 */
export function useTabData<T>(url: string, opts: { prefetchSiblings?: boolean } = {}): State<T> {
  // Sibling-range prefetch keeps range toggles instant, but it fires a request per RANGE_KEY. For
  // heavy endpoints (the operator tool's per-event resolvers, seconds each — and some ranges the
  // indexer can't compute at all), that's wasteful and hammers the bottleneck, so callers opt out.
  const doPrefetch = opts.prefetchSiblings !== false;

  const [state, setState] = useState<State<T>>(() => {
    const c = url ? cache.get(url) : undefined;
    return c ? { data: c.data as T, loading: false, error: null } : { data: null, loading: !!url, error: null };
  });

  useEffect(() => {
    if (!url) {
      // Intentional: this is a data-fetching hook; going idle on an empty url is the sync we want.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ data: null, loading: false, error: null });
      return;
    }

    let active = true;
    const cached = cache.get(url);

    if (cached) {
      // Instant paint from cache; quietly revalidate if it's gone stale (no indicator flash).
      setState({ data: cached.data as T, loading: false, error: null });
      // Already client-cached (a revisit) → the server built this at least once; warm the siblings
      // unless the last observed server state was cold.
      if (doPrefetch) maybePrefetchSiblings(url);
      if (Date.now() - cached.ts > STALE_MS) {
        fetchJson(url, false)
          .then((json) => {
            if (active) setState({ data: json as T, loading: false, error: null });
          })
          .catch(() => {});
      }
    } else {
      // Cold for this URL: keep any prior data on screen, show the indicator, fetch.
      setState((s) => ({ data: s.data, loading: true, error: null }));
      fetchJson(url, true)
        .then((json) => {
          if (active) setState({ data: json as T, loading: false, error: null });
          // Only now is the primary's cache status known — prefetch siblings iff it wasn't a MISS.
          if (doPrefetch) maybePrefetchSiblings(url);
        })
        .catch((e: Error) => {
          // Drop the prior data: it belongs to the previous url and must not show under this one.
          if (active && e.name !== 'AbortError') setState({ data: null, loading: false, error: e.message });
        });
    }

    return () => {
      active = false;
    };
  }, [url, doPrefetch]);

  return state;
}
