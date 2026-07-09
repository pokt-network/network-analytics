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
      if (!r.ok) throw new Error(`Request failed (${r.status})`);
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
 * Serves cached data instantly on revisit, keeps prior data visible during a cold fetch, and reports
 * visible fetches to the global loading store so the shell can indicate activity.
 */
export function useTabData<T>(url: string): State<T> {
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
      maybePrefetchSiblings(url);
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
          maybePrefetchSiblings(url);
        })
        .catch((e: Error) => {
          if (active && e.name !== 'AbortError') setState((s) => ({ data: s.data, loading: false, error: e.message }));
        });
    }

    return () => {
      active = false;
    };
  }, [url]);

  return state;
}
