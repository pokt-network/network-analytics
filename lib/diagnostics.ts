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

// ── Cache-age tracking ───────────────────────────────────────────────────────
// `unstable_cache` exposes no "when was this built" signal, so we stamp the build time *inside* the
// cached value. On a HIT the stored timestamp returns unchanged → age = now − builtAt = how long ago
// the warmer (or a user) populated this key. If the cron is firing every 10 min, no key should ever
// be older than ~10 min. diagJson unwraps the envelope so the client payload shape is untouched.
interface Envelope<T> {
  __diagBuiltAt: number;
  data: T;
}

function isEnvelope(v: unknown): v is Envelope<unknown> {
  return typeof v === 'object' && v !== null && '__diagBuiltAt' in v;
}

/** Wrap the payload builder passed to `unstable_cache` so the cached value records its build time.
 *  Stamped at *completion* so a freshly-built key reads age ≈ 0 and a HIT grows from there. */
export function stamped<T>(build: () => Promise<T>): () => Promise<Envelope<T>> {
  return async () => {
    const data = await build();
    return { __diagBuiltAt: Date.now(), data };
  };
}

/**
 * Run a cached builder, then return its JSON with `x-*` diagnostic headers attached.
 * `label` names the payload (e.g. 'traffic') so the overlay can group by tab. Pass the *whole*
 * `unstable_cache(...)()` call as `run` so the timing brackets the outer cache lookup.
 */
export async function diagJson<T>(label: string, run: () => Promise<T>): Promise<NextResponse> {
  const t0 = performance.now();
  const result = await run();
  const buildMs = Math.round((performance.now() - t0) * 10) / 10;

  // Unwrap the stamped() envelope (if present) so the client payload is exactly what it was before.
  let payload: unknown = result;
  let builtAt: number | null = null;
  if (isEnvelope(result)) {
    builtAt = result.__diagBuiltAt;
    payload = result.data;
  }

  const body = JSON.stringify(payload);
  const bytes = Buffer.byteLength(body);
  const oversize = bytes > DATA_CACHE_LIMIT_BYTES;
  const cache: DiagMeta['cache'] = buildMs > MISS_THRESHOLD_MS ? 'MISS' : 'HIT';

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-diag-label': label,
    'x-cache': cache,
    'x-build-ms': String(buildMs),
    'x-payload-bytes': String(bytes),
    'x-cache-oversize': oversize ? '1' : '0',
    // Standard header so build time also shows in the browser's Network → Timing tab.
    'server-timing': `build;desc="${label}";dur=${buildMs}`,
  };
  if (builtAt != null) {
    headers['x-built-at'] = String(builtAt);
    headers['x-cache-age-ms'] = String(Math.max(0, Date.now() - builtAt));
  }

  return new NextResponse(body, { headers });
}
