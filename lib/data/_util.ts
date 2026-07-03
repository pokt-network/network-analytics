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
