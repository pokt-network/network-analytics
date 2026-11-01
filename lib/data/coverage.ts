// The range newer indexers report next to a money answer: what was asked for, what is covered, and the settlement
// gaps. legacy_* ranges end INCLUSIVE (end_date), the catalog *_json ones are half-open; gaps are always half-open.
import { toDate } from '@/lib/time';

export interface CoverageRange {
  requested_from: string | null;
  requested_to: string | null;
  /** Both null when nothing in the range is covered. */
  covered_from: string | null;
  covered_to: string | null;
  /** Half-open [from, to); a null side is unbounded. */
  gaps: Array<{ from: string | null; to: string | null }>;
  /** true: requested_to / covered_to are inclusive (legacy_*); false: exclusive (catalog). */
  end_inclusive?: boolean;
}

/**
 * A legacy* / get…Json value in either shape. Newer indexers answer `{range, data}`, where `data` is the old
 * value; older ones answer the bare value. Run it on the value as the field is already read (after `parseScalar`
 * for a JSON field). `endInclusive` is what the field's range means when the indexer does not say.
 */
export function unwrapRange<T>(v: unknown, endInclusive: boolean): { data: T | null; range: CoverageRange | null } {
  if (v !== null && typeof v === 'object' && !Array.isArray(v) && 'range' in v && 'data' in v) {
    const o = v as { range: CoverageRange | null; data: T | null };
    return { data: o.data, range: o.range && { ...o.range, end_inclusive: o.range.end_inclusive ?? endInclusive } };
  }
  return { data: v as T, range: null };
}

/** Nothing in the range is covered: the indexer says so with null covered bounds (data is null or [] then). */
export function notCovered(range: CoverageRange | null): boolean {
  return !!range && range.covered_from === null && range.covered_to === null;
}

const ms = (s: string | null) => toDate(s)?.getTime() ?? NaN;

/**
 * The range's times parsed once, in milliseconds (NaN: null or unparseable). `from` / `to` are the covered span within
 * the window as [from, to) (an unbounded side is ±Infinity); `gaps` are the gaps inside it, clipped to it and merged
 * where they touch. A gap outside the span (the late start, the early end) is left to covered_from / covered_to.
 */
function parse(range: CoverageRange) {
  const inc = range.end_inclusive ? 1 : 0;
  const t = {
    requestedFrom: ms(range.requested_from),
    requestedTo: ms(range.requested_to),
    coveredFrom: ms(range.covered_from),
    coveredTo: ms(range.covered_to),
  };
  const or = (v: number, unbounded: number) => (Number.isNaN(v) ? unbounded : v);
  const from = Math.max(or(t.coveredFrom, -Infinity), or(t.requestedFrom, -Infinity));
  const to = Math.min(or(t.coveredTo + inc, Infinity), or(t.requestedTo + inc, Infinity));
  const gaps: Array<[number, number]> = [];
  const clipped = (range.gaps ?? [])
    .map((g): [number, number] => [Math.max(or(ms(g.from), -Infinity), from), Math.min(or(ms(g.to), Infinity), to)])
    .filter(([a, b]) => a < b)
    .sort((x, y) => x[0] - y[0]);
  for (const [a, b] of clipped) {
    const prev = gaps[gaps.length - 1];
    if (prev && a <= prev[1]) prev[1] = Math.max(prev[1], b);
    else gaps.push([a, b]);
  }
  return { ...t, from, to, gaps };
}

/** An indexer timestamp as microseconds since the epoch, exactly. The indexer's covered_to is a block's time + 1 µs, and
 *  a millisecond Date rounds that back onto the block itself, so comparisons against it are made here in µs. Null when
 *  it is missing or unparseable. */
export function toMicros(input: string | number | null | undefined): bigint | null {
  if (input == null || input === '') return null;
  // epoch numbers (toDate's ms or s): exact to the millisecond
  if (typeof input === 'number' || /^\d+$/.test(input)) {
    const d = toDate(input);
    return d ? BigInt(d.getTime()) * BigInt(1000) : null;
  }
  // date and time with `T` or a space, an optional fraction and an optional zone; no zone is UTC, as the indexer writes
  // it (read here, not by Date, which takes a space-separated form without a zone as local time)
  const m = input.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:(Z)|([+-])(\d{2})(?::?(\d{2}))?)?$/i);
  if (!m) {
    // a fraction the pattern cannot place is not truncated into a wrong instant; other forms (a bare date) as toDate
    if (/\.\d/.test(input)) return null;
    const d = toDate(input);
    return d ? BigInt(d.getTime()) * BigInt(1000) : null;
  }
  const [, y, mo, da, h, mi, se, fr, , sign, oh, om] = m;
  const offsetSeconds = sign ? (sign === '-' ? -1 : 1) * (Number(oh) * 3600 + Number(om ?? 0) * 60) : 0;
  const seconds = Date.UTC(Number(y), Number(mo) - 1, Number(da), Number(h), Number(mi), Number(se)) / 1000 - offsetSeconds;
  if (!Number.isFinite(seconds)) return null;
  return BigInt(seconds) * BigInt(1_000_000) + BigInt((fr ?? '').padEnd(6, '0').slice(0, 6));
}

/** Microseconds since the epoch as an ISO timestamp that keeps them (`…:16.796001Z`). */
export function microsToIso(us: bigint): string {
  const s = us / BigInt(1_000_000);
  return `${new Date(Number(s) * 1000).toISOString().slice(0, 19)}.${(us % BigInt(1_000_000)).toString().padStart(6, '0')}Z`;
}

/**
 * The parts of the requested window the answer does not cover, in microseconds, each once, half-open [from, to): a late
 * start, the gaps (clipped to the covered span and merged, as parse() does), and the end past covered_to. Empty when the
 * range is fully covered; for a range with nothing covered use notCovered() first. Microseconds, because covered_to is
 * the closing block's time + 1 µs: rows are counted against it exactly.
 */
export function uncoveredSpansMicros(range: CoverageRange): Array<[bigint, bigint]> {
  const inc = range.end_inclusive ? BigInt(1) : BigInt(0);
  const plus = (v: bigint | null) => (v === null ? null : v + inc);
  const rf = toMicros(range.requested_from);
  const rt = plus(toMicros(range.requested_to));
  const cf = toMicros(range.covered_from);
  const ct = plus(toMicros(range.covered_to));
  const max = (a: bigint | null, b: bigint | null) => (a === null ? b : b === null ? a : a > b ? a : b);
  const min = (a: bigint | null, b: bigint | null) => (a === null ? b : b === null ? a : a < b ? a : b);
  const lo = max(cf, rf);
  const hi = min(ct, rt);
  const gaps: Array<[bigint, bigint]> = [];
  for (const g of range.gaps ?? []) {
    const a = max(g.from === null ? lo : toMicros(g.from), lo);
    const b = min(g.to === null ? hi : toMicros(g.to), hi);
    if (a !== null && b !== null && a < b) gaps.push([a, b]);
  }
  gaps.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
  const merged: Array<[bigint, bigint]> = [];
  for (const [a, b] of gaps) {
    const prev = merged[merged.length - 1];
    if (prev && a <= prev[1]) prev[1] = b > prev[1] ? b : prev[1];
    else merged.push([a, b]);
  }
  const spans: Array<[bigint, bigint]> = [];
  if (rf !== null && lo !== null && lo > rf) spans.push([rf, lo]);
  spans.push(...merged);
  if (rt !== null && hi !== null && hi < rt) spans.push([hi, rt]);
  return spans.filter(([a, b]) => a < b);
}

/** An end short of the window by less than this is the indexer's normal lag behind now, not missing data. */
const COVERAGE_END_SLACK_MS = 3_600_000;
const HOUR_PRECISION_MAX_MS = 48 * 3_600_000;

/**
 * A short note when the answer covers less than was asked for ("Data since …", "until …", the gaps); null otherwise.
 * Days, or minutes (UTC) for an hourly chart or a window of 48 h or less.
 */
export function rangeNote(range: CoverageRange | null, interval?: 'hour' | 'day' | 'week'): string | null {
  if (!range) return null;
  if (notCovered(range)) return 'No data indexed for this window';
  const p = parse(range);
  const fine = interval === 'hour' || p.requestedTo - p.requestedFrom <= HOUR_PRECISION_MAX_MS;
  // `exclusiveEnd`: the instant is the end of a half-open span; at day precision it is shown as the day before it.
  const at = (t: number, exclusiveEnd = false) => {
    if (!Number.isFinite(t)) return '…';
    const iso = new Date(fine || !exclusiveEnd ? t : t - 1).toISOString();
    return fine ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : iso.slice(0, 10);
  };
  const parts: string[] = [];
  // an unbounded start (requested_from null) asked for whatever exists, so starting late is not a shortfall
  if (!Number.isNaN(p.requestedFrom) && !(p.coveredFrom <= p.requestedFrom)) parts.push(`Data since ${at(p.coveredFrom)}`);
  if (p.coveredTo < p.requestedTo - COVERAGE_END_SLACK_MS) {
    parts.push(`${parts.length ? 'until' : 'Data until'} ${at(p.coveredTo, !range.end_inclusive)}`);
  }
  const gaps = p.gaps.map(([a, b]) => {
    const [x, y] = [at(a), at(b, true)];
    return x === y ? x : `${x} – ${y}`;
  });
  const head = parts.join(' ');
  if (gaps.length) return `${head ? `${head}; ` : ''}gaps: ${gaps.join(', ')}`;
  return head || null;
}

const STEP_MS = { hour: 3_600_000, day: 86_400_000 } as const;

/**
 * Chart rows over every bucket of the requested window: a covered bucket keeps its value, 0 when the series has none
 * (the indexer omits empty buckets), and a bucket with nothing covered (before covered_from, after covered_to, inside
 * a gap) is null, so a line does not bridge it. `keys` are every series the chart draws (the tracked addresses, not
 * only those with rows), so a series with nothing in a covered bucket draws 0. Rows are `{date: ISO bucket start,
 * [key]: value}`. No range (an older
 * indexer), nothing covered, no rows or a weekly interval: the rows as they are.
 */
export function fillCoverage(
  rows: Array<Record<string, number | string | null>>,
  keys: string[],
  range: CoverageRange | null,
  interval: 'hour' | 'day' | 'week',
): Array<Record<string, number | string | null>> {
  if (!range || notCovered(range) || rows.length === 0 || interval === 'week') return rows;
  const step = STEP_MS[interval];
  const s = parse(range);
  const first = Math.floor(s.requestedFrom / step) * step;
  // Buckets that start before requested_to: one starting at it (an inclusive end on a bucket edge) is outside the window.
  const last = s.requestedTo;
  if (!Number.isFinite(first) || !Number.isFinite(last) || (last - first) / step > 10_000) return rows;
  const byDate = new Map(rows.map((r) => [String(r.date), r]));
  for (let b = first; b < last; b += step) {
    const date = new Date(b).toISOString();
    // covered time inside the bucket: its overlap with the span, minus the gaps (merged, so they do not overlap)
    const [lo, hi] = [Math.max(b, s.from), Math.min(b + step, s.to)];
    const covered = s.gaps.reduce((c, [a, z]) => c - Math.max(0, Math.min(hi, z) - Math.max(lo, a)), Math.max(0, hi - lo));
    const uncovered = covered <= 0;
    const row = { ...(byDate.get(date) ?? { date }) };
    for (const k of keys) if (!(k in row)) row[k] = uncovered ? null : 0;
    byDate.set(date, row);
  }
  return [...byDate.keys()].sort().map((d) => byDate.get(d)!);
}
