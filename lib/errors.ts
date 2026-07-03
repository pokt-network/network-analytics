// ─────────────────────────────────────────────────────────────────────────────
// VENDORED from pnf-explorer — DO NOT EDIT HERE.
// Managed by scripts/sync-vendor.mjs. Edit upstream in the explorer repo, then re-sync.
// ─────────────────────────────────────────────────────────────────────────────

// Structured data-layer error so routes can branch on not-found vs. server/indexing
// vs. generic failure (§11) and surface the egress proxy's x-deny-reason when present.
export type DataErrorKind = 'not-found' | 'server' | 'network' | 'graphql';

export class DataError extends Error {
  kind: DataErrorKind;
  status?: number;
  denyReason?: string;

  constructor(message: string, kind: DataErrorKind, status?: number, denyReason?: string) {
    super(message);
    this.name = 'DataError';
    this.kind = kind;
    this.status = status;
    this.denyReason = denyReason;
  }
}
