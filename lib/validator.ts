// ─────────────────────────────────────────────────────────────────────────────
// VENDORED from pnf-explorer — DO NOT EDIT HERE.
// Managed by scripts/sync-vendor.mjs. Edit upstream in the explorer repo, then re-sync.
// ─────────────────────────────────────────────────────────────────────────────

// Validator field parsers (DATA-CONTRACT §2,§3). commission + description come back as
// JSON objects from the indexer, NOT scalars — never read them raw in the UI.

export interface ValidatorCommission {
  rate?: string;
  maxRate?: string;
  maxChangeRate?: string;
}

export interface ValidatorDescription {
  moniker?: string;
  identity?: string;
  website?: string;
  securityContact?: string;
  details?: string;
}

function asObject<T>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  if (typeof value === 'object') return value as T;
  return null;
}

/** Commission rate as a percentage number. Stored as 1e18 fixed-point string (1e18 = 100%). */
export function commissionRatePct(commission: unknown): number | null {
  const c = asObject<ValidatorCommission>(commission);
  if (!c?.rate) return null;
  // 1e18 == 100% → divide by 1e16 to get percent. Number is safe (rate < 1e18).
  return Number(c.rate) / 1e16;
}

/** Formatted commission, e.g. "5.00%". */
export function formatCommission(commission: unknown, decimals = 2): string {
  const pct = commissionRatePct(commission);
  return pct == null ? '—' : `${pct.toFixed(decimals)}%`;
}

/** Validator display name = description.moniker, falling back to a truncated address upstream. */
export function validatorMoniker(description: unknown): string | null {
  const d = asObject<ValidatorDescription>(description);
  const m = d?.moniker?.trim();
  return m ? m : null;
}

export function validatorDescription(description: unknown): ValidatorDescription | null {
  return asObject<ValidatorDescription>(description);
}
