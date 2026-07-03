// ─────────────────────────────────────────────────────────────────────────────
// VENDORED from pnf-explorer — DO NOT EDIT HERE.
// Managed by scripts/sync-vendor.mjs. Edit upstream in the explorer repo, then re-sync.
// ─────────────────────────────────────────────────────────────────────────────

import { gqlFetch } from './graphql';
import { INDEXER_LAG_THRESHOLD } from './config';
import type { NetworkId } from './networks';
import { METADATA_QUERY, STATUS_QUERY } from './queries/shared';
import type { FallbackDecision, IndexerMetadata, MetadataResult, StatusResult } from './types';

/** Fetch `_metadata`. Defaults to fresh (no-store) so fallback decisions reflect the head. */
export async function getMetadata(network: NetworkId, opts?: { cache?: RequestCache }): Promise<IndexerMetadata> {
  const data = await gqlFetch<MetadataResult>(network, METADATA_QUERY, undefined, {
    cache: opts?.cache ?? 'no-store',
  });
  return data._metadata;
}

/** Fetch the live `status` (latest block + heights). Client polling passes no-store. */
export async function getStatus(network: NetworkId, opts?: { cache?: RequestCache; signal?: AbortSignal }): Promise<StatusResult> {
  return gqlFetch<StatusResult>(network, STATUS_QUERY, undefined, {
    cache: opts?.cache ?? 'no-store',
    signal: opts?.signal,
  });
}

/**
 * Pure fallback rule (§2): fall back to LCD/RPC when EITHER the indexer self-reports unhealthy
 * (`!indexerHealthy`) OR its head lags real chain head by more than INDEXER_LAG_THRESHOLD blocks.
 *
 * NOTE (live history): on 2026-06-05 `_metadata.indexerHealthy` was persistently `false` even at
 * lag 0, so the rule was temporarily keyed on lag only. Re-verified 2026-06-06: `indexerHealthy`
 * now reports `true` when synced (stable across polls), so it has been restored as an authoritative
 * trigger per the original §2 design. Lag still independently catches a stall (lastProcessedHeight
 * stops advancing while targetHeight tracks chain head); a fully unreachable indexer is handled by
 * getUseRpcData()'s catch. `lastFinalizedVerifiedHeight` (may be null) stays in the payload only.
 */
export function evaluateFallback(metadata: IndexerMetadata): FallbackDecision {
  const lag = metadata.targetHeight - metadata.lastProcessedHeight;
  const useRpc = !metadata.indexerHealthy || lag > INDEXER_LAG_THRESHOLD;
  return { useRpc, lag, metadata };
}

/**
 * Decide indexer vs RPC for a server render. If `_metadata` itself can't be read, force RPC
 * so pages still resolve (returns error for the indexer-lagging banner, §11).
 */
export async function getUseRpcData(network: NetworkId): Promise<FallbackDecision> {
  try {
    return evaluateFallback(await getMetadata(network));
  } catch (e) {
    return { useRpc: true, lag: null, metadata: null, error: (e as Error).message };
  }
}
