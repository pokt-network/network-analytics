import { NextResponse } from 'next/server';
import { getServicesList } from '@/lib/data/services';

export const revalidate = 43200; // 12h — the services list is very stable

export async function GET() {
  const services = await getServicesList();
  return NextResponse.json({ services });
}
