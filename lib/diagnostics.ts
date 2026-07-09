import { NextResponse } from 'next/server';

// ── Server-side cache diagnostics ────────────────────────────────────────────
// Wraps a cached-payload builder, times it, and stamps the response with headers the client
// DiagnosticsOverlay reads live. The whole point is to make HIT vs MISS *observable*: `unstable_cache`
// exposes no hit/miss signal, but a MISS blocks on the ~seconds indexer build while a HIT (fresh OR
// stale-while-revalidate) returns in single-digit ms — so wall-clock time is the classifier.

/** Above this many ms, the outer cache had to build (indexer path) → treat as a MISS. A warm hit is
 *  ~8ms and a stale-serve is comparably fast, so this cleanly separates the slow first-population. */
const MISS_THRESHOLD_MS = 200;

/** Vercel's Data Cache silently refuses to persist a single entry larger than 2 MB — so an oversize
 *  payload recomputes on every request (a permanent MISS no warmer can fix). Flag it explicitly. */
export const DATA_CACHE_LIMIT_BYTES = 2 * 1024 * 1024;

export interface DiagMeta {
  label: string;
  cache: 'HIT' | 'MISS';
  buildMs: number;
  bytes: number;
  oversize: boolean;
}

/**
 * Run a cached builder, then return its JSON with `x-*` diagnostic headers attached.
 * `label` names the payload (e.g. 'traffic') so the overlay can group by tab. Pass the *whole*
 * `unstable_cache(...)()` call as `run` so the timing brackets the outer cache lookup.
 */
export async function diagJson<T>(label: string, run: () => Promise<T>): Promise<NextResponse> {
  const t0 = performance.now();
  const payload = await run();
  const buildMs = Math.round((performance.now() - t0) * 10) / 10;

  const body = JSON.stringify(payload);
  const bytes = Buffer.byteLength(body);
  const oversize = bytes > DATA_CACHE_LIMIT_BYTES;
  const cache: DiagMeta['cache'] = buildMs > MISS_THRESHOLD_MS ? 'MISS' : 'HIT';

  return new NextResponse(body, {
    headers: {
      'content-type': 'application/json',
      'x-diag-label': label,
      'x-cache': cache,
      'x-build-ms': String(buildMs),
      'x-payload-bytes': String(bytes),
      'x-cache-oversize': oversize ? '1' : '0',
      // Standard header so build time also shows in the browser's Network → Timing tab.
      'server-timing': `build;desc="${label}";dur=${buildMs}`,
    },
  });
}
