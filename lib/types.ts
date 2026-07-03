// ─────────────────────────────────────────────────────────────────────────────
// VENDORED from pnf-explorer — DO NOT EDIT HERE.
// Managed by scripts/sync-vendor.mjs. Edit upstream in the explorer repo, then re-sync.
// ─────────────────────────────────────────────────────────────────────────────

// Shared response shapes for the cross-cutting queries.

export interface IndexerMetadata {
  targetHeight: number;
  lastFinalizedVerifiedHeight: number | null;
  lastProcessedHeight: number;
  lastProcessedTimestamp: string | null;
  indexerHealthy: boolean;
}

export interface MetadataResult {
  _metadata: IndexerMetadata;
}

export interface StatusBlockNode {
  id: string;
  timestamp: string;
  totalRelays: string | null;
}

export interface StatusResult {
  blocks: { nodes: StatusBlockNode[] };
  _metadata: { targetHeight: number; lastProcessedHeight: number };
}

/** Outcome of the indexer-vs-RPC fallback decision (§2). */
export interface FallbackDecision {
  useRpc: boolean;
  lag: number | null;
  metadata: IndexerMetadata | null;
  /** Set when metadata itself could not be read (indexer unreachable → force RPC). */
  error?: string;
}
