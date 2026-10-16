import { gqlFetch } from '@/lib/graphql';
import { toDate } from '@/lib/time';
import { UPOKT_PER_POKT } from '@/lib/config';
import { NETWORK, type RangeKey } from '@/lib/app-config';
import { rangeWindow, rangeTTL } from '@/lib/timeranges';
import { SERVICES_FIRST_PAGE, SERVICES_LIST, SERVICE_USAGE_ONE } from '@/lib/queries/analytics';
import { getServicesPerformance } from './traffic';
import { num, parseScalar } from './_util';
import { unwrapRange } from './coverage';

export interface ServiceListItem {
  id: string;
  name: string;
}

/** Pages of 1000 read for the picker before giving up (262 services today fit in the first). */
const SERVICES_MAX_PAGES = 20;

/** All services (id + label) for the picker: pages of 1000 by cursor, one request today, every page at the same block
 *  height. A walk that reads fewer rows than the list counts is retried once; if it still falls short, what was read is
 *  returned with a `note` the picker shows, never as the whole list and never as an empty picker. */
export async function getServicesList(): Promise<{ services: ServiceListItem[]; note?: string }> {
  let walk = await walkServices();
  if (walk.short) walk = await walkServices();
  if (walk.short) console.warn(`services list: ${walk.short}`);
  const seen = new Set<string>();
  const out: ServiceListItem[] = [];
  for (const n of walk.nodes) {
    if (n?.id && !seen.has(n.id)) {
      seen.add(n.id);
      out.push({ id: n.id, name: n.name || n.id });
    }
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return walk.short ? { services: out, note: `Showing ${out.length} services; the list could not be read whole (${walk.short}).` } : { services: out };
}

type ServicesPage = { totalCount: number; pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ServiceListItem[] };

/** One walk of the services list; `short` says why it read less than the count. The first page comes with the last
 *  processed height in the same request, and every later page is read at that height. A list that fits one page (the
 *  case today: 269 services) is that one request. */
async function walkServices(): Promise<{ nodes: ServiceListItem[]; short: string | null }> {
  // No per-page fetch cache: the route's unstable_cache keeps the whole walk.
  const first = await gqlFetch<{ _metadata: { lastProcessedHeight: number | string | null } | null; services: ServicesPage }>(NETWORK, SERVICES_FIRST_PAGE);
  const blockHeight = first._metadata?.lastProcessedHeight;
  const nodes: ServiceListItem[] = [...(first.services?.nodes ?? [])];
  let totalCount = first.services?.totalCount ?? 0;
  let after = first.services?.pageInfo?.endCursor ?? null;
  let more = first.services?.pageInfo?.hasNextPage ?? false;
  if (more && blockHeight == null) return { nodes, short: 'the indexer reports no processed height to read the next pages at' };
  for (let page = 1; more; page++) {
    if (page === SERVICES_MAX_PAGES) return { nodes, short: `stopped after ${page} pages, ${nodes.length} rows of ${totalCount}` };
    if (!after) return { nodes, short: `more pages but no cursor after ${nodes.length} rows of ${totalCount}` };
    const data = await gqlFetch<{ services: ServicesPage }>(NETWORK, SERVICES_LIST, { after, blockHeight: String(blockHeight) });
    totalCount = data.services?.totalCount ?? 0;
    nodes.push(...(data.services?.nodes ?? []));
    after = data.services?.pageInfo?.endCursor ?? null;
    more = data.services?.pageInfo?.hasNextPage ?? false;
  }
  return { nodes, short: nodes.length === totalCount ? null : `read ${nodes.length} rows, the list counts ${totalCount}` };
}

interface RelayPointRaw {
  bucket_start: string;
  estimated_relays: number | string;
  estimated_compute_units: number | string;
  settled_upokt: number | string;
}

export interface ServiceVolumePoint {
  date: string;
  estimatedCU: number;
  estimatedRelays: number;
}

export interface ServiceDetail {
  info: { id: string; name: string; appsStaked: number; suppliersStaked: number; sharePct: number };
  stats: { cu: number; relays: number; suppliers: number; grossRewardsPokt: number };
  series: ServiceVolumePoint[];
}

async function getServiceVolume(serviceId: string, range: RangeKey, now?: number): Promise<{ series: ServiceVolumePoint[]; grossRewardsPokt: number }> {
  const w = rangeWindow(range, now);
  const data = await gqlFetch<{ getServiceUsageJson: unknown }>(
    NETWORK,
    SERVICE_USAGE_ONE,
    { service: serviceId, start: w.startISO, end: w.endISO, interval: w.interval },
    { revalidate: rangeTTL(range) },
  );
  const raw = unwrapRange<RelayPointRaw[]>(parseScalar(data.getServiceUsageJson), false).data ?? [];
  let grossUpokt = 0;
  const series = raw
    .map((p) => {
      grossUpokt += num(p.settled_upokt);
      return {
        date: toDate(p.bucket_start)?.toISOString() ?? p.bucket_start,
        estimatedCU: num(p.estimated_compute_units),
        estimatedRelays: num(p.estimated_relays),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  return { series, grossRewardsPokt: grossUpokt / UPOKT_PER_POKT };
}

export async function getServiceDetail(serviceId: string, range: RangeKey, now?: number): Promise<ServiceDetail> {
  const [perf, volume] = await Promise.all([getServicesPerformance(range, now), getServiceVolume(serviceId, range, now)]);
  const p = perf.find((x) => x.serviceId === serviceId);
  return {
    info: {
      id: serviceId,
      name: p?.serviceName || serviceId,
      appsStaked: p?.appsStaked ?? 0,
      suppliersStaked: p?.suppliersStaked ?? 0,
      sharePct: p?.sharePct ?? 0,
    },
    stats: {
      cu: p?.estimatedComputedUnits ?? 0,
      relays: p?.estimatedRelays ?? 0,
      suppliers: p?.suppliersStaked ?? 0,
      grossRewardsPokt: volume.grossRewardsPokt,
    },
    series: volume.series,
  };
}
