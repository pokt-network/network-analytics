import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getServicesList } from '@/lib/data/services';

export const revalidate = 43200; // 12h — the services list is very stable

export async function GET() {
  const services = await unstable_cache(() => getServicesList(), ['services-list'], { revalidate: 43200 })();
  return NextResponse.json({ services });
}
