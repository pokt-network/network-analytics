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
      next: { revalidate: 60 }, // short TTL cache
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
