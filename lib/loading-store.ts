'use client';

// Tiny global "is anything loading" store. `useTabData` reports every *visible* fetch here so the
// shell can show one consistent indicator (top bar + "Updating…" chip) no matter which tab or range
// triggered it. Silent background work (prefetch / revalidate) deliberately does NOT report here —
// it must never flash the UI.
import { useSyncExternalStore } from 'react';

let inFlight = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Mark the start of a user-visible request. Pair with `endRequest()`. */
export function beginRequest() {
  inFlight += 1;
  emit();
}

/** Mark the end of a user-visible request. */
export function endRequest() {
  inFlight = Math.max(0, inFlight - 1);
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const getSnapshot = () => inFlight;
const getServerSnapshot = () => 0;

/** `true` whenever at least one user-visible request is in flight. */
export function useIsFetching(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) > 0;
}
