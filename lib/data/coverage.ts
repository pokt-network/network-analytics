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
// A null or unparseable bound is unbounded on that side.
const lower = (s: string | null) => (Number.isFinite(ms(s)) ? ms(s) : -Infinity);
const upper = (s: string | null, inclusive = false) => (Number.isFinite(ms(s)) ? ms(s) + (inclusive ? 1 : 0) : Infinity);

/** The covered span within the window and the gaps inside it, as [from, to) milliseconds; a gap outside the span
 *  (the late start, the early end) is left to covered_from / covered_to, and the rest are clipped to the span. */
function span(range: CoverageRange) {
  const inc = !!range.end_inclusive;
  const from = Math.max(lower(range.covered_from), lower(range.requested_from));
  const to = Math.min(upper(range.covered_to, inc), upper(range.requested_to, inc));
  const gaps = (range.gaps ?? []).map((g) => [Math.max(lower(g.from), from), Math.min(upper(g.to), to)]).filter(([a, b]) => a < b);
  return { from, to, gaps };
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
  const fine = interval === 'hour' || ms(range.requested_to) - ms(range.requested_from) <= HOUR_PRECISION_MAX_MS;
  // `exclusiveEnd`: the instant is the end of a half-open span; at day precision it is shown as the day before it.
  const at = (t: number, exclusiveEnd = false) => {
    if (!Number.isFinite(t)) return '…';
    const iso = new Date(fine || !exclusiveEnd ? t : t - 1).toISOString();
    return fine ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : iso.slice(0, 10);
  };
  const s = span(range);
  const parts: string[] = [];
  if (!(ms(range.covered_from) <= ms(range.requested_from))) parts.push(`Data since ${at(ms(range.covered_from))}`);
  if (ms(range.covered_to) < ms(range.requested_to) - COVERAGE_END_SLACK_MS) {
    parts.push(`${parts.length ? 'until' : 'Data until'} ${at(ms(range.covered_to), !range.end_inclusive)}`);
  }
  const gaps = s.gaps.map(([a, b]) => {
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
 * a gap) is null, so a line does not bridge it. Rows are `{date: ISO bucket start, [key]: value}`. No range (an older
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
  const s = span(range);
  const first = Math.floor(ms(range.requested_from) / step) * step;
  const last = ms(range.requested_to) + (range.end_inclusive ? 1 : 0); // exclusive
  if (!Number.isFinite(first) || !Number.isFinite(last) || (last - first) / step > 10_000) return rows;
  const byDate = new Map(rows.map((r) => [String(r.date), r]));
  for (let b = first; b < last; b += step) {
    const date = new Date(b).toISOString();
    const uncovered = b + step <= s.from || b >= s.to || s.gaps.some(([a, z]) => a <= b && b + step <= z);
    const row = { ...(byDate.get(date) ?? { date }) };
    for (const k of keys) if (!(k in row)) row[k] = uncovered ? null : 0;
    byDate.set(date, row);
  }
  return [...byDate.keys()].sort().map((d) => byDate.get(d)!);
}
