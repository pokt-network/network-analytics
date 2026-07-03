import { NextResponse } from 'next/server';
import { getPoktPrice } from '@/lib/price';

// Standalone price endpoint (Economy market-cap context). Server-side CMC; short-TTL cache.
export const revalidate = 60;

export async function GET() {
  const price = await getPoktPrice();
  return NextResponse.json({ price });
}
