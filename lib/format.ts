// ─────────────────────────────────────────────────────────────────────────────
// VENDORED from pnf-explorer — DO NOT EDIT HERE.
// Managed by scripts/sync-vendor.mjs. Edit upstream in the explorer repo, then re-sync.
// ─────────────────────────────────────────────────────────────────────────────

import { UPOKT_PER_POKT } from './config';

type Numeric = string | number | bigint | null | undefined;

function toBigInt(v: Numeric): bigint {
  if (v === null || v === undefined || v === '') return BigInt(0);
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') return BigInt(Math.trunc(v));
  // strings may carry a fractional part on some scalars; keep the integer portion
  const intPart = String(v).split('.')[0].replace(/[^0-9-]/g, '');
  return intPart === '' || intPart === '-' ? BigInt(0) : BigInt(intPart);
}

/** Group an integer string with thousands separators. */
function groupThousands(intDigits: string): string {
  const neg = intDigits.startsWith('-');
  const digits = neg ? intDigits.slice(1) : intDigits;
  return (neg ? '-' : '') + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Format a upokt amount as POKT (÷1e6). The single shared conversion util (§13) —
 * never inline ÷1e6 anywhere. BigInt-based so large balances/supply stay exact.
 * @param decimals fractional POKT digits to show (default 2); trailing zeros kept.
 */
export function formatPokt(upokt: Numeric, decimals = 2): string {
  const micro = toBigInt(upokt);
  const neg = micro < BigInt(0);
  const abs = neg ? -micro : micro;
  const whole = abs / BigInt(UPOKT_PER_POKT);
  const frac = abs % BigInt(UPOKT_PER_POKT);
  let out = groupThousands(whole.toString());
  if (decimals > 0) {
    const fracStr = frac.toString().padStart(6, '0').slice(0, decimals);
    out += '.' + fracStr;
  }
  return (neg ? '-' : '') + out;
}

/** Raw upokt with separators, e.g. "142,908,410,000 upokt" (for hover/raw rows). */
export function formatUpokt(upokt: Numeric): string {
  return groupThousands(toBigInt(upokt).toString());
}

/** Plain integer/number with thousands separators. */
export function formatNumber(v: Numeric): string {
  if (typeof v === 'number' && !Number.isInteger(v)) {
    const [i, f] = v.toString().split('.');
    return groupThousands(i) + (f ? '.' + f : '');
  }
  return groupThousands(toBigInt(v).toString());
}

/** Compact notation for summary cards: 412.8M, 5.91B, 1.66B (§13). Full precision elsewhere. */
const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '+': '',
};

/** Clean scientific notation with a Unicode superscript exponent, e.g. 1e58 → "1×10⁵⁸". */
function toScientific(n: number, digits = 2): string {
  const [mantissa, exp] = n.toExponential(digits).split('e');
  const sup = exp.split('').map((c) => SUPERSCRIPT[c] ?? c).join('');
  return `${parseFloat(mantissa)}×10${sup}`;
}

export function formatCompact(v: Numeric, digits = 2): string {
  const n = typeof v === 'bigint' ? Number(v) : Number(v ?? 0);
  if (!Number.isFinite(n)) return '0';
  const abs = Math.abs(n);
  // Past quadrillions the K/M/B/T suffixes run out; fall back to clean scientific notation
  // rather than gluing a 'T' onto an exponential (e.g. the absurd betanet test supply).
  if (abs >= 1e15) return toScientific(n, 1);
  const units: [number, string][] = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [threshold, suffix] of units) {
    if (abs >= threshold) {
      const scaled = n / threshold;
      return `${parseFloat(scaled.toFixed(digits))}${suffix}`;
    }
  }
  return formatNumber(Math.round(n));
}

/** Compact POKT for summary cards: upokt → POKT → compact, e.g. "1.66B POKT" value part. */
export function formatPoktCompact(upokt: Numeric, digits = 2): string {
  const pokt = Number(toBigInt(upokt)) / UPOKT_PER_POKT;
  return formatCompact(pokt, digits);
}

/** Block production time. Indexer `timeToBlock` is MILLISECONDS → seconds, e.g. "60.76s". */
export function formatBlockTime(ms: Numeric, decimals = 2): string {
  if (ms == null || ms === '') return '—';
  return `${(Number(ms) / 1000).toFixed(decimals)}s`;
}

/** Truncate a hash/address keeping head+tail, e.g. "0x9f2a…c41e" / "pokt1q9…3x6z9". */
export function truncate(value: string | null | undefined, head = 6, tail = 4): string {
  if (!value) return '';
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}
