import { unstable_cache } from 'next/cache';
import { getServicesList } from '@/lib/data/services';
import { diagJson, stamped } from '@/lib/diagnostics';

export const revalidate = 43200; // 12h — the services list is very stable

export async function GET() {
  return diagJson('services-list', () =>
    unstable_cache(stamped(async () => ({ services: await getServicesList() })), ['services-list'], {
      revalidate: 43200,
      tags: ['analytics'],
    })(),
  );
}
