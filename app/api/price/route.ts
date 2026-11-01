import { getCachedPoktPrice } from '@/lib/price';
import { diagJson } from '@/lib/diagnostics';

// Standalone price endpoint (Economy market-cap context). Reads the same shared, CMC-credit-budgeted
// price entry as the live strip (getCachedPoktPrice, 5-min TTL), so this route adds no CMC calls of
// its own. The 60s route-segment cache just trims function invocations. See lib/price.ts.
export const revalidate = 60;

export async function GET() {
  return diagJson('price', async () => ({ price: await getCachedPoktPrice() }));
}
