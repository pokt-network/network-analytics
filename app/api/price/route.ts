import { getPoktPrice } from '@/lib/price';
import { diagJson } from '@/lib/diagnostics';

// Standalone price endpoint (Economy market-cap context). Server-side CMC; short-TTL cache.
export const revalidate = 60;

export async function GET() {
  return diagJson('price', async () => ({ price: await getPoktPrice() }));
}
