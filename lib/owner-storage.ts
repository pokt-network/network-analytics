// Owner Staking address list persistence. bech32 addresses are PUBLIC identifiers (not secrets),
// so localStorage is the correct place for a personal watchlist. On read we validate + drop
// malformed entries so a hand-edited/corrupt store can never break the page.
import { OWNER_ADDRESS_CAP } from '@/lib/app-config';

export const ADDRESS_RE = /^pokt1[0-9a-z]{38,}$/;
const KEY = 'pnf-analytics-owner-addresses';

export function isValidAddress(a: string): boolean {
  return ADDRESS_RE.test(a);
}

export function loadAddresses(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((a) => typeof a === 'string' && ADDRESS_RE.test(a)).slice(0, OWNER_ADDRESS_CAP);
  } catch {
    return [];
  }
}

export function saveAddresses(list: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, OWNER_ADDRESS_CAP)));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

/** Split a paste box (comma/whitespace/newline separated) into valid + invalid, deduped, capped. */
export function parseAddressInput(text: string): { valid: string[]; invalid: string[] } {
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
  return { valid: valid.slice(0, OWNER_ADDRESS_CAP), invalid };
}
