// ─────────────────────────────────────────────────────────────────────────────
// VENDORED from pnf-explorer — DO NOT EDIT HERE.
// Managed by scripts/sync-vendor.mjs. Edit upstream in the explorer repo, then re-sync.
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import { createContext, useContext } from 'react';
import { DEFAULT_NETWORK, type NetworkId } from './networks';

// The active network for the current render, set by `app/[network]/layout.tsx` from the route
// param. Client components (LiveBadge poll, GlobalSearch, NetLink, the switcher) read it here so
// they target the right indexer and build correctly-prefixed in-app links.
const NetworkContext = createContext<NetworkId>(DEFAULT_NETWORK);

export function NetworkProvider({ network, children }: { network: NetworkId; children: React.ReactNode }) {
  return <NetworkContext.Provider value={network}>{children}</NetworkContext.Provider>;
}

/** The active network id for the current route. */
export function useNetwork(): NetworkId {
  return useContext(NetworkContext);
}
