'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { SERIES_COLORS, DEFAULT_RANGE, type RangeKey } from '@/lib/app-config';
import { loadAddresses, saveAddresses } from '@/lib/staking/addresses';

// Shared state for a staking tool (Owner or Operator): the tracked address list (persisted per-tool),
// the active range, and a stable address→series-color map. Both tools wrap their body in this so the
// chrome (ManageAddresses, SupplierToolLayout) and the data widgets read one source of truth.
interface StakingToolCtx {
  addresses: string[];
  setAddresses: (next: string[]) => void;
  range: RangeKey;
  setRange: (r: RangeKey) => void;
  cap: number;
  /** Stable color for an address (by its index in the current list). */
  colorFor: (addr: string) => string;
  /** False until the localStorage list has been read post-mount (avoids an empty-state flash). */
  hydrated: boolean;
}

const Ctx = createContext<StakingToolCtx | null>(null);

export function StakingToolProvider({
  storeKey,
  cap,
  defaultRange = DEFAULT_RANGE,
  children,
}: {
  storeKey: string;
  cap: number;
  defaultRange?: RangeKey;
  children: ReactNode;
}) {
  const [addresses, setAddrs] = useState<string[]>([]);
  const [range, setRange] = useState<RangeKey>(defaultRange);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage after mount (not available during SSR; a lazy initializer would cause
  // a hydration mismatch).
  useEffect(() => {
    // Syncing an external store (localStorage, unavailable during SSR) into React state — the
    // allowed "subscribe to an external system" case; the rule is overly strict about it here.
    /* eslint-disable react-hooks/set-state-in-effect */
    const saved = loadAddresses(storeKey, cap);
    if (saved.length) setAddrs(saved);
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [storeKey, cap]);

  const setAddresses = (next: string[]) => {
    const capped = next.slice(0, cap);
    setAddrs(capped);
    saveAddresses(storeKey, capped, cap);
  };

  const colorMap = useMemo(() => {
    const m = new Map<string, string>();
    addresses.forEach((a, i) => m.set(a, SERIES_COLORS[i % SERIES_COLORS.length]));
    return m;
  }, [addresses]);

  const value = useMemo<StakingToolCtx>(
    () => ({
      addresses,
      setAddresses,
      range,
      setRange,
      cap,
      colorFor: (a: string) => colorMap.get(a) ?? SERIES_COLORS[0],
      hydrated,
    }),
    // setAddresses is recreated each render but closes only over stable setters; colorMap tracks addresses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addresses, range, cap, colorMap, hydrated],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStakingTool(): StakingToolCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useStakingTool must be used within a StakingToolProvider');
  return c;
}
