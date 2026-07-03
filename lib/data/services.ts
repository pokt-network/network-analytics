import { gqlFetch } from '@/lib/graphql';
import { toDate } from '@/lib/time';
import { UPOKT_PER_POKT } from '@/lib/config';
import { NETWORK, type RangeKey } from '@/lib/app-config';
import { rangeWindow, rangeTTL } from '@/lib/timeranges';
import { SERVICES_LIST_PAGE, RELAYS_BY_SERVICE_PER_POINT } from '@/lib/queries/analytics';
import { getServicesPerformance } from './traffic';
import { num, parseScalar } from './_util';

export interface ServiceListItem {
  id: string;
  name: string;
}

/** All services (id + label) for the picker. Connection caps at 100 → two offset pages cover ~173. */
export async function getServicesList(): Promise<ServiceListItem[]> {
  const page = (offset: number) =>
    gqlFetch<{ services: { nodes: ServiceListItem[] } }>(NETWORK, SERVICES_LIST_PAGE, { offset }, { revalidate: 12 * 3600 });
  const [p0, p1] = await Promise.all([page(0), page(100)]);
  const seen = new Set<string>();
  const out: ServiceListItem[] = [];
  for (const n of [...(p0.services?.nodes ?? []), ...(p1.services?.nodes ?? [])]) {
    if (n?.id && !seen.has(n.id)) {
      seen.add(n.id);
      out.push({ id: n.id, name: n.name || n.id });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

interface RelayPointRaw {
  date_truncated: string;
  service_id: string;
  estimated_relays: number | string;
  estimated_computed_units: number | string;
  claimed_upokt: number | string;
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

async function getServiceVolume(serviceId: string, range: RangeKey): Promise<{ series: ServiceVolumePoint[]; grossRewardsPokt: number }> {
  const w = rangeWindow(range);
  const data = await gqlFetch<{ getRelaysByServicePerPointJson: unknown }>(
    NETWORK,
    RELAYS_BY_SERVICE_PER_POINT,
    { start: w.startISO, end: w.endISO, interval: w.interval },
    { revalidate: rangeTTL(range) },
  );
  const raw = parseScalar<RelayPointRaw[]>(data.getRelaysByServicePerPointJson).filter((p) => p.service_id === serviceId);
  let grossUpokt = 0;
  const series = raw
    .map((p) => {
      grossUpokt += num(p.claimed_upokt);
      return {
        date: toDate(p.date_truncated)?.toISOString() ?? p.date_truncated,
        estimatedCU: num(p.estimated_computed_units),
        estimatedRelays: num(p.estimated_relays),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  return { series, grossRewardsPokt: grossUpokt / UPOKT_PER_POKT };
}

export async function getServiceDetail(serviceId: string, range: RangeKey): Promise<ServiceDetail> {
  const [perf, volume] = await Promise.all([getServicesPerformance(range), getServiceVolume(serviceId, range)]);
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
