// ─────────────────────────────────────────────────────────────────────────────
// VENDORED from pnf-explorer — DO NOT EDIT HERE.
// Managed by scripts/sync-vendor.mjs. Edit upstream in the explorer repo, then re-sync.
// ─────────────────────────────────────────────────────────────────────────────

// Supplier service-config endpoint RPC type → display label. Enum from poktroll
// shared/service.proto (RPCType). Display-only; falls back to the raw ordinal.
const RPC_TYPE: Record<number, string> = {
  0: 'Unknown',
  1: 'gRPC',
  2: 'WebSocket',
  3: 'JSON-RPC',
  4: 'REST',
  5: 'CometBFT',
};

export function rpcTypeLabel(n: number | null | undefined): string {
  if (n == null) return '—';
  return RPC_TYPE[n] ?? `Type ${n}`;
}
