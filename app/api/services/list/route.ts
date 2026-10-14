import { unstable_cache } from 'next/cache';
import { getServicesList } from '@/lib/data/services';
import { diagJson, stamped } from '@/lib/diagnostics';

// Dynamic: the 12 h cache is the unstable_cache entry below, the only one, so a short read (kept out of it) is not
// stored by the route cache either. As static ISR the route stored whatever the handler returned for 12 h.
export const dynamic = 'force-dynamic';

type ServicesList = Awaited<ReturnType<typeof getServicesList>>;

// A list read short (it carries a note) is served but kept out of the 12 h cache: thrown out of the cached builder,
// caught here, so the next request reads the list again.
class ShortList extends Error {
  constructor(readonly list: ServicesList) {
    super('services list read short');
  }
}

export async function GET() {
  return diagJson('services-list', async () => {
    try {
      return await unstable_cache(
        stamped(async () => {
          const list = await getServicesList();
          if (list.note) throw new ShortList(list);
          return list;
        }),
        ['services-list'],
        { revalidate: 43200, tags: ['analytics'] },
      )();
    } catch (e) {
      if (e instanceof ShortList) return e.list;
      throw e;
    }
  });
}
