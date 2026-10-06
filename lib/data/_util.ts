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

/** The part of a requested range the money functions answered for, with the settlement gaps inside it. */
export interface CoverageRange {
  requested_from: string | null;
  requested_to: string | null;
  covered_from: string | null;
  covered_to: string | null;
  gaps: Array<{ from: string; to: string }>;
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

/** "Data since <day>" (plus the gaps) when the answer covers less than was asked for; null otherwise. */
export function rangeNote(range: CoverageRange | null): string | null {
  if (!range) return null;
  const day = (s: string) => new Date(s).toISOString().slice(0, 10); // UTC, whatever offset the server wrote
  const parts: string[] = [];
  const from = range.covered_from ? Date.parse(range.covered_from) : NaN;
  const asked = range.requested_from ? Date.parse(range.requested_from) : NaN;
  if (range.covered_from && (Number.isNaN(asked) || from > asked)) parts.push(`Data since ${day(range.covered_from)}`);
  if (range.gaps?.length) parts.push(`gaps: ${range.gaps.map((g) => (day(g.from) === day(g.to) ? day(g.from) : `${day(g.from)} – ${day(g.to)}`)).join(', ')}`);
  return parts.length ? parts.join('; ') : null;
}
