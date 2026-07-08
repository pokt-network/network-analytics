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
//   • prefetches sibling ranges after a load so the *first* range toggle is already warm.
interface CacheEntry {
  ts: number;
  data: unknown;
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
    .then((r) => {
      if (!r.ok) throw new Error(`Request failed (${r.status})`);
      return r.json();
    })
    .then((json) => {
      cache.set(url, { ts: Date.now(), data: json });
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
        })
        .catch((e: Error) => {
          if (active && e.name !== 'AbortError') setState((s) => ({ data: s.data, loading: false, error: e.message }));
        });
    }

    // Warm the other ranges in the background so the next toggle is instant.
    prefetchSiblingRanges(url);

    return () => {
      active = false;
    };
  }, [url]);

  return state;
}
