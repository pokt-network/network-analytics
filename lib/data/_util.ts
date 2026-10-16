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

/** The most services one `getServiceUsageJson` read holds (its `top_by_settled` cap). */
export const USAGE_SERVICES_CAP = 200;

/** Refuses a usage answer whose services reached the cap: the services beyond it are missing from it. */
export function assertUsageNotCut(serviceIds: Iterable<string>): void {
  if (new Set(serviceIds).size >= USAGE_SERVICES_CAP) throw new Error('the usage read reached its service cap');
}
