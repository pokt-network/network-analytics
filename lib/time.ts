// ─────────────────────────────────────────────────────────────────────────────
// VENDORED from pnf-explorer — DO NOT EDIT HERE.
// Managed by scripts/sync-vendor.mjs. Edit upstream in the explorer repo, then re-sync.
// ─────────────────────────────────────────────────────────────────────────────

// Shared time utilities (§13). Relative "4s ago" for display; absolute UTC on hover.

type TimeInput = string | number | Date | null | undefined;

/** Normalize indexer/LCD timestamps: ISO strings, epoch seconds, or epoch milliseconds. */
export function toDate(input: TimeInput): Date | null {
  if (input == null || input === '') return null;
  if (input instanceof Date) return input;
  if (typeof input === 'number' || /^\d+$/.test(input)) {
    const n = Number(input);
    // 13+ digits → ms; 10-ish digits → seconds
    return new Date(n > 1e12 ? n : n * 1000);
  }
  // Indexer timestamps are UTC but ISO-without-timezone ("2026-06-05T23:37:18.568").
  // JS would parse those as LOCAL time — append 'Z' so they're read as UTC.
  const needsZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(input) && !/[Zz]|[+-]\d{2}:?\d{2}$/.test(input);
  const d = new Date(needsZ ? `${input}Z` : input);
  return Number.isNaN(d.getTime()) ? null : d;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Jun-05-2026 03:12:28 PM UTC" — matches the mockups. */
export function absoluteUtc(input: TimeInput): string {
  const d = toDate(input);
  if (!d) return '—';
  const mm = MONTHS[d.getUTCMonth()];
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  let h = d.getUTCHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const hh = String(h).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${mm}-${dd}-${yyyy} ${hh}:${min}:${ss} ${ampm} UTC`;
}

/**
 * Approximate wall-clock for a number of FUTURE blocks (Shannon block time ≈ 60s). Used for
 * unstake/unbond ETAs from `unstakingEndHeight − currentHeight`. e.g. 120 → "~2h", 0 → "imminent".
 */
export function etaFromBlocks(blocks: number, secsPerBlock = 60): string {
  if (!Number.isFinite(blocks) || blocks <= 0) return 'imminent';
  const secs = blocks * secsPerBlock;
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `~${d}d${h ? ` ${h}h` : ''}`;
  if (h > 0) return `~${h}h${m ? ` ${m}m` : ''}`;
  return `~${Math.max(1, m)}m`;
}

/**
 * Approximate elapsed wall-clock for a number of PAST blocks (Shannon ≈ 60s/block) — the mirror of
 * `etaFromBlocks`, for "last settled N blocks ago". e.g. 120 → "2h ago", 0 → "recent".
 */
export function agoFromBlocks(blocks: number, secsPerBlock = 60): string {
  if (!Number.isFinite(blocks) || blocks <= 0) return 'recent';
  const secs = blocks * secsPerBlock;
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  return `${Math.max(1, m)}m ago`;
}

/** "4s ago", "3m ago", "2h ago", "5d ago". Pass `nowMs` for deterministic SSR. */
export function relativeTime(input: TimeInput, nowMs?: number): string {
  const d = toDate(input);
  if (!d) return '—';
  const now = nowMs ?? Date.now();
  const secs = Math.max(0, Math.round((now - d.getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}
