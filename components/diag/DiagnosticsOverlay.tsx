'use client';

import { useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react';

// ── Live cache diagnostics overlay ───────────────────────────────────────────
// Enable with `?diag=1` (persists for the tab) or toggle with Ctrl+Shift+D. Renders nothing
// otherwise, so it's safe to leave mounted in production. It answers, live as the page loads:
//   • Is each /api payload a cache HIT (warm, ~ms) or MISS (cold, seconds of indexer time)?
//   • How big is each payload (and is it over Vercel's 2 MB Data-Cache limit → never cached)?
//   • When is the page "fully loaded" (network idle) vs the browser paint marks (FCP/LCP)?
//   • Is the cron warmer even configured, and does it point at the protected deployment URL?
// Capture is installed at module load (not in an effect) so the very first fetch is caught.

const isClient = typeof window !== 'undefined';

type CacheState = 'HIT' | 'MISS' | '—';

interface ReqRow {
  id: number;
  label: string;
  path: string;
  cache: CacheState;
  buildMs: number | null;
  rttMs: number;
  bytes: number | null;
  oversize: boolean;
  ageMs: number | null;
  status: number;
  ok: boolean;
}

interface Marks {
  fcp: number | null;
  lcp: number | null;
  dcl: number | null;
  load: number | null;
  idle: number | null;
}

interface DiagEnv {
  env: string;
  region: string | null;
  commit: string | null;
  deploymentHost: string | null;
  warm: {
    cronSecretSet: boolean;
    cronWarmBaseUrlSet: boolean;
    cronWarmBaseUrlHost: string | null;
    warmTargetHost: string;
    warmTargetIsDeploymentUrl: boolean;
  };
}

interface ProbeSample {
  cache: CacheState;
  rttMs: number;
  buildMs: number | null;
  ageMs: number | null;
}
interface ProbeResult {
  label: string;
  cold: ProbeSample;
  warm: ProbeSample;
}

interface Snap {
  rows: ReqRow[];
  marks: Marks;
  env: DiagEnv | null;
  inflight: number;
  now: number;
  probes: ProbeResult[];
  probing: boolean;
  warm: { status: number; body: string } | null;
}

// ── External store (decoupled from React so capture can start before mount) ──────────────────────
let snap: Snap = {
  rows: [],
  marks: { fcp: null, lcp: null, dcl: null, load: null, idle: null },
  env: null,
  inflight: 0,
  now: 0,
  probes: [],
  probing: false,
  warm: null,
};
const listeners = new Set<() => void>();
function emit() {
  snap = { ...snap };
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function getSnapshot() {
  return snap;
}
const SERVER_SNAP = snap;
function getServerSnapshot() {
  return SERVER_SNAP;
}

let rowId = 0;
function pushRow(r: Omit<ReqRow, 'id'>) {
  snap.rows = [...snap.rows, { ...r, id: ++rowId }].slice(-60);
  emit();
}
function setMark(k: keyof Marks, v: number | null) {
  if (snap.marks[k] === v) return;
  snap.marks = { ...snap.marks, [k]: v };
  emit();
}

const round = (n: number) => Math.round(n * 10) / 10;
const numOrNull = (v: string | null) => (v == null || v === '' ? null : Number(v));

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}
function pathOf(url: string): string {
  try {
    const u = new URL(url, isClient ? window.location.origin : 'http://x');
    return u.pathname + u.search;
  } catch {
    return url;
  }
}
function labelFromUrl(url: string): string {
  const m = url.match(/\/api\/([^?]+)/);
  return m ? m[1].replace(/\//g, ':') : url;
}
function shouldTrack(url: string): boolean {
  if (!url.includes('/api/')) return false;
  if (url.includes('/api/diag') || url.includes('/api/cron/warm')) return false;
  if (/[?&]_probe=/.test(url)) return false;
  return true;
}

// ── Enable gate — the URL's `diag` param is the single source of truth ─────────
// No sessionStorage: clearing `?diag=1` from the URL must hide the panel immediately. The app
// preserves the `diag` arg across its own tab/range navigation, so it stays visible while you browse
// and disappears the moment the arg is removed.
function urlHasDiag(): boolean {
  if (!isClient) return false;
  try {
    const v = new URLSearchParams(window.location.search).get('diag');
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
}

// The app navigates via history.pushState/replaceState (no framework event), so patch them to emit a
// change event; combined with popstate this lets us react to every URL change.
let historyPatched = false;
function patchHistory() {
  if (historyPatched || !isClient) return;
  historyPatched = true;
  for (const m of ['pushState', 'replaceState'] as const) {
    const orig = history[m];
    history[m] = function (this: History, ...args: Parameters<History['pushState']>) {
      const r = orig.apply(this, args);
      window.dispatchEvent(new Event('diag:locationchange'));
      return r;
    } as History[typeof m];
  }
}

function subscribeUrl(cb: () => void): () => void {
  patchHistory();
  window.addEventListener('popstate', cb);
  window.addEventListener('diag:locationchange', cb);
  return () => {
    window.removeEventListener('popstate', cb);
    window.removeEventListener('diag:locationchange', cb);
  };
}

/** Toggle `?diag=1` in the URL (Ctrl+Shift+D). All other args are preserved. */
function toggleDiagInUrl() {
  if (!isClient) return;
  const p = new URLSearchParams(window.location.search);
  if (p.get('diag') === '1' || p.get('diag') === 'true') p.delete('diag');
  else p.set('diag', '1');
  const q = p.toString();
  history.replaceState(null, '', `${window.location.pathname}${q ? `?${q}` : ''}`);
  window.dispatchEvent(new Event('diag:locationchange'));
}

// ── Capture install (idempotent, module-load) ────────────────────────────────
let installed = false;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let lastCompletionAt = 0;

function scheduleIdle() {
  lastCompletionAt = performance.now();
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (snap.inflight === 0 && snap.rows.length > 0) setMark('idle', round(lastCompletionAt));
  }, 800);
}

function recordRes(url: string, start: number, res: Response) {
  pushRow({
    label: res.headers.get('x-diag-label') ?? labelFromUrl(url),
    path: pathOf(url),
    cache: (res.headers.get('x-cache') as CacheState) ?? '—',
    buildMs: numOrNull(res.headers.get('x-build-ms')),
    rttMs: round(performance.now() - start),
    bytes: numOrNull(res.headers.get('x-payload-bytes')),
    oversize: res.headers.get('x-cache-oversize') === '1',
    ageMs: numOrNull(res.headers.get('x-cache-age-ms')),
    status: res.status,
    ok: res.ok,
  });
}

function readNav() {
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  if (!nav) return;
  if (nav.domContentLoadedEventEnd) setMark('dcl', round(nav.domContentLoadedEventEnd));
  if (nav.loadEventEnd) setMark('load', round(nav.loadEventEnd));
}

let origFetch: typeof fetch | null = null;

function install() {
  if (installed || !isClient) return;
  installed = true;

  const tick = () => {
    snap.now = performance.now();
    emit();
  };
  setInterval(tick, 100);
  tick();

  origFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlOf(input);
    if (!shouldTrack(url)) return origFetch!(input, init);
    const start = performance.now();
    snap.inflight += 1;
    emit();
    try {
      const res = await origFetch!(input, init);
      recordRes(url, start, res);
      return res;
    } catch (e) {
      pushRow({
        label: labelFromUrl(url),
        path: pathOf(url),
        cache: '—',
        buildMs: null,
        rttMs: round(performance.now() - start),
        bytes: null,
        oversize: false,
        ageMs: null,
        status: 0,
        ok: false,
      });
      throw e;
    } finally {
      snap.inflight = Math.max(0, snap.inflight - 1);
      emit();
      scheduleIdle();
    }
  };

  try {
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.name === 'first-contentful-paint') setMark('fcp', round(e.startTime));
        if (e.entryType === 'largest-contentful-paint') setMark('lcp', round(e.startTime));
      }
    });
    po.observe({ type: 'paint', buffered: true });
    po.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    /* older browsers */
  }
  readNav();
  window.addEventListener('load', readNav);

  // Env/config introspection (bypasses tracking via shouldTrack exclusion).
  origFetch('/api/diag')
    .then((r) => r.json())
    .then((e: DiagEnv) => {
      snap.env = e;
      emit();
    })
    .catch(() => {});
}

if (isClient && urlHasDiag()) install();

// ── Actions ──────────────────────────────────────────────────────────────────
const PROBE_ROUTES: Array<{ label: string; url: string }> = [
  { label: 'traffic', url: '/api/traffic?range=7d' },
  { label: 'network', url: '/api/network?range=7d' },
  { label: 'suppliers', url: '/api/suppliers?range=7d' },
  { label: 'services-analytics', url: '/api/services/analytics?range=7d' },
  { label: 'economy', url: '/api/economy' },
  { label: 'economy-burnmint', url: '/api/economy/burnmint?range=7d' },
];

async function timedProbe(url: string, n: number) {
  const f = origFetch ?? window.fetch;
  const start = performance.now();
  // `_probe` busts the *browser* cache (unique URL) so the request reaches the server, but the
  // server's unstable_cache key ignores it → this measures the real server HIT/MISS.
  const sep = url.includes('?') ? '&' : '?';
  const res = await f(`${url}${sep}_probe=${n}`);
  return {
    cache: (res.headers.get('x-cache') as CacheState) ?? '—',
    rttMs: round(performance.now() - start),
    buildMs: numOrNull(res.headers.get('x-build-ms')),
    ageMs: numOrNull(res.headers.get('x-cache-age-ms')),
  };
}

async function runProbe() {
  if (snap.probing) return;
  snap.probing = true;
  snap.probes = [];
  emit();
  for (const r of PROBE_ROUTES) {
    try {
      const cold = await timedProbe(r.url, 1); // MISS if cold, else already-warm HIT
      const warm = await timedProbe(r.url, 2); // should be a HIT
      snap.probes = [...snap.probes, { label: r.label, cold, warm }];
      emit();
    } catch {
      /* skip */
    }
  }
  snap.probing = false;
  emit();
}

async function runWarm() {
  const f = origFetch ?? window.fetch;
  try {
    const res = await f('/api/cron/warm');
    const body = await res.text();
    snap.warm = { status: res.status, body: body.slice(0, 300) };
  } catch (e) {
    snap.warm = { status: 0, body: String(e) };
  }
  emit();
}

// ── Formatting ────────────────────────────────────────────────────────────────
function fmtMs(n: number | null): string {
  if (n == null) return '—';
  return n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${Math.round(n)}ms`;
}
function fmtBytes(n: number | null): string {
  if (n == null) return '—';
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)}MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)}KB`;
  return `${n}B`;
}
/** Cache age (how long ago this key was built by the warmer or a user). */
function fmtAge(ms: number | null): string {
  if (ms == null) return '';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${Math.round(ms / 3_600_000)}h`;
}
// The cron warms every 10 min, so a healthy key is < ~11 min old. Older ⇒ the warmer isn't keeping up.
const AGE_STALE_MS = 11 * 60_000;
function ageColor(ms: number | null): string {
  if (ms == null) return COLORS.dim;
  return ms > AGE_STALE_MS ? COLORS.warn : COLORS.hit;
}

const COLORS = {
  panel: 'rgba(13,17,23,0.94)',
  border: 'rgba(255,255,255,0.14)',
  text: '#e6edf3',
  dim: '#8b949e',
  hit: '#3fb950',
  hitBg: 'rgba(63,185,80,0.16)',
  miss: '#f85149',
  missBg: 'rgba(248,81,73,0.16)',
  warn: '#e3b341',
  accent: '#58a6ff',
};

function Badge({ cache }: { cache: CacheState }) {
  const isHit = cache === 'HIT';
  const isMiss = cache === 'MISS';
  return (
    <span
      style={{
        display: 'inline-block',
        minWidth: 34,
        textAlign: 'center',
        padding: '1px 4px',
        borderRadius: 4,
        fontWeight: 700,
        fontSize: 10,
        color: isHit ? COLORS.hit : isMiss ? COLORS.miss : COLORS.dim,
        background: isHit ? COLORS.hitBg : isMiss ? COLORS.missBg : 'transparent',
      }}
    >
      {cache}
    </span>
  );
}

function Chip({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ color: COLORS.dim, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</span>
      <span style={{ fontWeight: strong ? 700 : 500, color: strong ? COLORS.accent : COLORS.text }}>{value}</span>
    </div>
  );
}

export function DiagnosticsOverlay() {
  const [open, setOpen] = useState(true);
  const s = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // Enabled tracks the URL's `diag` param reactively (useSyncExternalStore handles the SSR→client
  // switch without a hydration mismatch). Clearing the arg hides the panel immediately.
  const enabled = useSyncExternalStore(subscribeUrl, urlHasDiag, () => false);

  useEffect(() => {
    if (enabled) install();
  }, [enabled]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        toggleDiagInUrl();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!enabled) return null;

  const cold = s.rows.filter((r) => r.cache === 'MISS').length;
  const warm = s.rows.filter((r) => r.cache === 'HIT').length;
  const totalBytes = s.rows.reduce((a, r) => a + (r.bytes ?? 0), 0);
  const ages = s.rows.map((r) => r.ageMs).filter((a): a is number => a != null);
  const oldestAge = ages.length ? Math.max(...ages) : null;
  const idleTxt = s.marks.idle != null ? fmtMs(s.marks.idle) : s.inflight > 0 ? 'loading…' : '—';

  const mono = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' } as const;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 12,
        right: 12,
        zIndex: 99999,
        width: open ? 400 : 'auto',
        maxWidth: 'calc(100vw - 24px)',
        maxHeight: '82vh',
        overflow: 'auto',
        background: COLORS.panel,
        color: COLORS.text,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 10,
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(6px)',
        fontSize: 11,
        lineHeight: 1.45,
        ...mono,
      }}
    >
      {/* Header + live clock */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          borderBottom: open ? `1px solid ${COLORS.border}` : 'none',
          position: 'sticky',
          top: 0,
          background: COLORS.panel,
        }}
      >
        <span style={{ fontWeight: 700, letterSpacing: 0.3 }}>⚡ CACHE DIAG</span>
        <span style={{ marginLeft: 'auto', fontWeight: 700, color: s.marks.idle != null ? COLORS.hit : COLORS.accent }}>
          {s.marks.idle != null ? `✓ ${fmtMs(s.marks.idle)}` : `${(s.now / 1000).toFixed(1)}s`}
          {s.inflight > 0 && <span style={{ color: COLORS.warn }}> ●{s.inflight}</span>}
        </span>
        <button
          onClick={() => setOpen((o) => !o)}
          style={{ background: 'none', border: 'none', color: COLORS.dim, cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
          title={open ? 'Minimize' : 'Expand'}
        >
          {open ? '–' : '+'}
        </button>
      </div>

      {open && (
        <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Fully-loaded clock in context with paint marks */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6 }}>
            <Chip label="FCP" value={fmtMs(s.marks.fcp)} />
            <Chip label="LCP" value={fmtMs(s.marks.lcp)} />
            <Chip label="DCL" value={fmtMs(s.marks.dcl)} />
            <Chip label="load" value={fmtMs(s.marks.load)} />
            <Chip label="net idle" value={idleTxt} strong />
          </div>

          {/* Summary */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span>
              <b>{s.rows.length}</b> reqs
            </span>
            <span style={{ color: COLORS.miss }}>
              <b>{cold}</b> cold
            </span>
            <span style={{ color: COLORS.hit }}>
              <b>{warm}</b> warm
            </span>
            <span style={{ color: COLORS.dim }}>{fmtBytes(totalBytes)} total</span>
            {oldestAge != null && (
              <span style={{ color: ageColor(oldestAge) }} title="oldest cache key seen — should stay under the 10-min warm cadence">
                oldest <b>{fmtAge(oldestAge)}</b>
              </span>
            )}
          </div>

          {/* Live request table */}
          <div>
            <div style={{ color: COLORS.dim, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>
              Requests (live)
            </div>
            {s.rows.length === 0 && <div style={{ color: COLORS.dim }}>waiting for /api calls…</div>}
            {s.rows.map((r) => (
              <div
                key={r.id}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', borderTop: `1px solid rgba(255,255,255,0.05)` }}
              >
                <Badge cache={r.cache} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.path}>
                  {r.label}
                  {r.ageMs != null && (
                    <span style={{ color: ageColor(r.ageMs) }} title="cache age — time since this key was last built">
                      {' '}
                      ·{fmtAge(r.ageMs)}
                    </span>
                  )}
                  {!r.ok && <span style={{ color: COLORS.miss }}> !{r.status}</span>}
                </span>
                <span style={{ color: COLORS.dim, width: 52, textAlign: 'right' }} title="server build time">
                  {fmtMs(r.buildMs)}
                </span>
                <span style={{ width: 52, textAlign: 'right' }} title="client round-trip">
                  {fmtMs(r.rttMs)}
                </span>
                <span style={{ color: r.oversize ? COLORS.miss : COLORS.dim, width: 52, textAlign: 'right' }} title={r.oversize ? '>2MB — never stored by Vercel Data Cache' : 'payload size'}>
                  {r.oversize ? '⚠' : ''}
                  {fmtBytes(r.bytes)}
                </span>
              </div>
            ))}
          </div>

          {/* Environment / warmer config */}
          {s.env && (
            <div>
              <div style={{ color: COLORS.dim, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>
                Deployment / warmer
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                <span>env: <b>{s.env.env}</b></span>
                {s.env.region && <span>region: {s.env.region}</span>}
                {s.env.commit && <span>@{s.env.commit}</span>}
              </div>
              <div>
                warm target: <b>{s.env.warm.warmTargetHost}</b>{' '}
                {s.env.warm.cronWarmBaseUrlSet ? '(CRON_WARM_BASE_URL)' : '(fallback $VERCEL_URL)'}
              </div>
              <div>CRON_SECRET: {s.env.warm.cronSecretSet ? 'set' : <span style={{ color: COLORS.warn }}>unset</span>}</div>
              {s.env.warm.warmTargetIsDeploymentUrl && (
                <div style={{ color: COLORS.miss, marginTop: 4 }}>
                  ⚠ Warmer targets the protected deployment URL → the cron fetch is likely 401&apos;d and warms
                  nothing. Set <b>CRON_WARM_BASE_URL</b> to the public domain.
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={runProbe} disabled={s.probing} style={btn}>
              {s.probing ? 'probing…' : 'Probe caches ×2'}
            </button>
            <button onClick={runWarm} style={btn}>
              Warm now
            </button>
          </div>

          {s.probes.length > 0 && (
            <div>
              <div style={{ color: COLORS.dim, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>
                Probe (fetch ×2 — expect MISS→HIT; age &lt; 10m ⇒ cron warming)
              </div>
              {s.probes.map((p) => (
                <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</span>
                  <Badge cache={p.cold.cache} />
                  <span style={{ width: 44, textAlign: 'right', color: COLORS.dim }}>{fmtMs(p.cold.rttMs)}</span>
                  <span style={{ color: COLORS.dim }}>→</span>
                  <Badge cache={p.warm.cache} />
                  <span style={{ width: 44, textAlign: 'right', color: COLORS.dim }}>{fmtMs(p.warm.rttMs)}</span>
                  <span style={{ width: 40, textAlign: 'right', color: ageColor(p.warm.ageMs) }} title="cache age">
                    {p.warm.ageMs != null ? fmtAge(p.warm.ageMs) : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {s.warm && (
            <div style={{ color: s.warm.status === 200 ? COLORS.hit : COLORS.warn, wordBreak: 'break-all' }}>
              warm [{s.warm.status}]: {s.warm.body}
              {s.warm.status === 401 && <div style={{ color: COLORS.dim }}>401 = CRON_SECRET set; run via curl with the bearer.</div>}
            </div>
          )}

          <div style={{ color: COLORS.dim, fontSize: 9 }}>Ctrl+Shift+D or ?diag=1 to toggle · clearing the arg hides this</div>
        </div>
      )}
    </div>
  );
}

const btn: CSSProperties = {
  background: 'rgba(88,166,255,0.14)',
  border: `1px solid ${COLORS.border}`,
  color: COLORS.accent,
  borderRadius: 6,
  padding: '4px 8px',
  cursor: 'pointer',
  fontSize: 11,
  fontFamily: 'inherit',
};
