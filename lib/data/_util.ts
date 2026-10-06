// Shared coercions for the JSON-scalar analytics payloads. Every numeric field arrives as a
// string OR number depending on the resolver; always coerce. Some resolvers double-encode their
// whole payload as a JSON string — `parseScalar` handles both the string and already-parsed cases.

export function num(v: unknown): number {
  const n = typeof v === 'bigint' ? Number(v) : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** A resolver value that may be a JSON string (double-encoded) or an already-parsed value. */
export function parseScalar<T>(v: unknown): T {
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as T;
    } catch {
      return [] as unknown as T;
    }
  }
  return (v ?? ([] as unknown)) as T;
}

/** The part of a requested range the money functions answered for, with the settlement gaps inside it. Times are
 *  half-open like the range; covered_from / covered_to are null when nothing is covered, a gap side null when unbounded. */
export interface CoverageRange {
  requested_from: string | null;
  requested_to: string | null;
  covered_from: string | null;
  covered_to: string | null;
  gaps: Array<{ from: string | null; to: string | null }>;
}

/**
 * A legacy* / get…Json value in either shape. Newer indexers answer `{range, data}`, where `data` is the old
 * value and `null` means nothing in the range is covered (no data, not 0). Older ones answer the bare value.
 * Run it on the value as the field is already read (after `parseScalar` for a JSON field).
 */
export function unwrapRange<T>(v: unknown): { data: T | null; range: CoverageRange | null } {
  if (v !== null && typeof v === 'object' && !Array.isArray(v) && 'range' in v && 'data' in v) {
    const o = v as { range: CoverageRange | null; data: T | null };
    return { data: o.data, range: o.range };
  }
  return { data: v as T, range: null };
}

/** An end short of the window by less than this is the indexer's normal lag behind now, not missing data. */
const COVERAGE_END_SLACK_MS = 3_600_000;

/** A short note when the answer covers less than was asked for ("Data since …", "until …", the gaps); null otherwise. */
export function rangeNote(range: CoverageRange | null): string | null {
  if (!range) return null;
  const t = (s: string | null) => (s ? Date.parse(s) : NaN);
  // UTC day of a time; an exclusive end is the day of the instant just before it. Unbounded or unparseable: "…".
  const day = (s: string | null, exclusive = false) => {
    const ms = t(s) - (exclusive ? 1 : 0);
    return Number.isNaN(ms) ? '…' : new Date(ms).toISOString().slice(0, 10);
  };
  if (range.covered_from === null && range.covered_to === null) return 'No data indexed for this window yet';
  const parts: string[] = [];
  if (range.covered_from && !(t(range.covered_from) <= t(range.requested_from))) parts.push(`Data since ${day(range.covered_from)}`);
  if (range.covered_to && t(range.covered_to) < t(range.requested_to) - COVERAGE_END_SLACK_MS) {
    parts.push(`${parts.length ? 'until' : 'Data until'} ${day(range.covered_to, true)}`);
  }
  const gaps = (range.gaps ?? []).map((g) => {
    const [a, b] = [day(g.from), day(g.to, true)];
    return a === b ? a : `${a} – ${b}`;
  });
  const head = parts.join(' ');
  if (gaps.length) return `${head ? `${head}; ` : ''}gaps: ${gaps.join(', ')}`;
  return head || null;
}
