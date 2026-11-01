import { unstable_cache } from 'next/cache';

// POKT price / market cap via CoinMarketCap. SERVER-SIDE ONLY — the key is never exposed to the
// client (brief §1). Degrades to null (UI shows "—") when no key is configured or CMC errors.

export interface PoktPrice {
  price: number;
  change24h: number;
  marketCap: number;
}

const CMC_URL = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=POKT&convert=USD';

export async function getPoktPrice(): Promise<PoktPrice | null> {
  const key = process.env.CMC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(CMC_URL, {
      headers: { 'X-CMC_PRO_API_KEY': key, Accept: 'application/json' },
      // No per-fetch cache: `getCachedPoktPrice` (below) owns the TTL. A `next: { revalidate }` here
      // would be a second, conflicting cache layer — and is ignored anyway inside `unstable_cache`.
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: Record<string, unknown>;
    };
    // CMC returns data.POKT as an object (or array if the symbol is ambiguous) — handle both.
    const raw = json?.data?.POKT;
    const entry = Array.isArray(raw) ? raw[0] : raw;
    const quote = (entry as { quote?: { USD?: Record<string, number> } })?.quote?.USD;
    if (!quote || quote.price == null) return null;
    return {
      price: Number(quote.price),
      change24h: Number(quote.percent_change_24h ?? 0),
      marketCap: Number(quote.market_cap ?? 0),
    };
  } catch {
    return null;
  }
}

// CoinMarketCap bills ~1 credit per quotes/latest call, and the Basic (free) plan caps at 15,000
// credits/month. Price is this dashboard's ONLY CMC draw, so a single shared entry governs every
// surface that shows it (the /api/live strip + /api/price), refreshed at most once per PRICE_TTL
// regardless of traffic or how many serverless instances are warm.
//
//   TTL 300s → ≤1 call / 5 min → ≤288/day → ≤~8,640 per 30-day month  (~58% of the 15k cap)
//
// For comparison, reading CMC on each 15s live-strip poll burns ~5,760/day → ~170k/month, which
// exhausts the free cap in ~2.6 days. Near-time pricing is fine for the analytics dashboard, so up
// to 5 min of staleness is the trade for staying well under budget; raise PRICE_TTL for more margin.
const PRICE_TTL = 300;

/** Process-wide shared price entry. Route handlers call THIS, never `getPoktPrice` directly, so CMC
 *  is hit at most once per PRICE_TTL across the whole app (see the credit-budget note above). */
export const getCachedPoktPrice = unstable_cache(getPoktPrice, ['pokt-price'], { revalidate: PRICE_TTL });
