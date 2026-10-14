import { unstable_cache } from 'next/cache';
import { getServicesList } from '@/lib/data/services';
import { diagJson, stamped } from '@/lib/diagnostics';

export const revalidate = 43200; // 12h — the services list is very stable

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
