// Shared address handling for the staking tools (Owner + Operator). bech32 pokt1 addresses are
// PUBLIC identifiers (not secrets), so a per-tool watchlist lives in localStorage. Each tool passes
// its own storage key so the Owner and Operator lists never collide. On read we validate + drop
// malformed entries so a hand-edited/corrupt store can never break the page.

export const ADDRESS_RE = /^pokt1[0-9a-z]{38,}$/;

export function isValidAddress(a: string): boolean {
  return ADDRESS_RE.test(a);
}

export function loadAddresses(key: string, cap: number): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((a) => typeof a === 'string' && ADDRESS_RE.test(a)).slice(0, cap);
  } catch {
    return [];
  }
}

export function saveAddresses(key: string, list: string[], cap: number): void {
  try {
    localStorage.setItem(key, JSON.stringify(list.slice(0, cap)));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

/** Split a paste box (comma/whitespace/newline separated) into valid + invalid, deduped, capped. */
export function parseAddressInput(text: string, cap: number): { valid: string[]; invalid: string[] } {
  const tokens = text
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const t of tokens) {
    if (ADDRESS_RE.test(t)) {
      if (!valid.includes(t)) valid.push(t);
    } else {
      invalid.push(t);
    }
  }
  return { valid: valid.slice(0, cap), invalid };
}
