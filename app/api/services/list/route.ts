import { staleCached } from '@/lib/window-cache';
import { getServicesList } from '@/lib/data/services';
import { diagJson, stamped } from '@/lib/diagnostics';

// Dynamic: the 12 h cache is the staleCached entry below, the only one, so a short read (kept out of it) is not
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

// A short read is kept 60 s in this server instance, so a run of requests does not walk the list twice each.
const SHORT_TTL_MS = 60_000;
let lastShort: { at: number; list: ServicesList } | null = null;

export async function GET() {
  return diagJson('services-list', async () => {
    if (lastShort && Date.now() - lastShort.at < SHORT_TTL_MS) return stamped(async () => lastShort!.list)();
    try {
      return await staleCached(
        ['services-list'],
        43200,
        stamped(async () => {
          const list = await getServicesList();
          if (list.note) throw new ShortList(list);
          return list;
        }),
        undefined,
        ['analytics'],
      );
    } catch (e) {
      if (e instanceof ShortList) {
        lastShort = { at: Date.now(), list: e.list };
        return stamped(async () => e.list)();
      }
      throw e;
    }
  });
}
