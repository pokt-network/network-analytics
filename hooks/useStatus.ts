// ─────────────────────────────────────────────────────────────────────────────
// VENDORED from pnf-explorer — DO NOT EDIT HERE.
// Managed by scripts/sync-vendor.mjs. Edit upstream in the explorer repo, then re-sync.
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useState } from 'react';
import { getStatus } from '@/lib/metadata';
import { INDEXER_LAG_THRESHOLD } from '@/lib/config';
import { useNetwork } from '@/lib/network-context';

export interface LiveStatus {
  height: number;
  timestamp: string;
  totalRelays: string | null;
  targetHeight: number;
  lastProcessedHeight: number;
  lag: number;
  healthy: boolean;
}

interface UseStatusState {
  status: LiveStatus | null;
  error: boolean;
  loading: boolean;
}

const POLL_MS = 15_000;

/** Client-polls `status` every 15s for the live badge + "refresh on new block" (§3 heartbeat). */
export function useStatus(): UseStatusState {
  const network = useNetwork();
  const [state, setState] = useState<UseStatusState>({ status: null, error: false, loading: true });

  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;

    async function poll() {
      controller?.abort();
      controller = new AbortController();
      try {
        const data = await getStatus(network, { signal: controller.signal });
        if (!active) return;
        const node = data.blocks.nodes[0];
        const targetHeight = Number(data._metadata.targetHeight);
        const lastProcessedHeight = Number(data._metadata.lastProcessedHeight);
        const lag = targetHeight - lastProcessedHeight;
        setState({
          status: {
            height: Number(node?.id ?? lastProcessedHeight),
            timestamp: node?.timestamp ?? '',
            totalRelays: node?.totalRelays ?? null,
            targetHeight,
            lastProcessedHeight,
            lag,
            healthy: lag <= INDEXER_LAG_THRESHOLD,
          },
          error: false,
          loading: false,
        });
      } catch (e) {
        if (!active || (e as Error).name === 'AbortError') return;
        setState((s) => ({ status: s.status, error: true, loading: false }));
      }
    }

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      active = false;
      controller?.abort();
      clearInterval(id);
    };
  }, [network]);

  return state;
}
