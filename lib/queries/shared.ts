// ─────────────────────────────────────────────────────────────────────────────
// VENDORED from pnf-explorer — DO NOT EDIT HERE.
// Managed by scripts/sync-vendor.mjs. Edit upstream in the explorer repo, then re-sync.
// ─────────────────────────────────────────────────────────────────────────────

// Shared queries — verbatim from assets/api-index/_shared.md. Do not edit field selections.

export const STATUS_QUERY = /* GraphQL */ `
  query status {
    blocks(orderBy: ID_DESC, first: 1) {
      nodes {
        id
        timestamp
        totalRelays
      }
    }
    _metadata {
      targetHeight
      lastProcessedHeight
    }
  }
`;

export const METADATA_QUERY = /* GraphQL */ `
  query metadata {
    _metadata {
      targetHeight
      lastFinalizedVerifiedHeight
      lastProcessedHeight
      lastProcessedTimestamp
      indexerHealthy
    }
  }
`;
