import { gqlFetch } from '@/lib/graphql';
import { toDate } from '@/lib/time';
import { NETWORK, type RangeKey } from '@/lib/app-config';
import { rangeWindow, rangeTTL } from '@/lib/timeranges';
import { RELAYS_BY_SERVICE_PER_POINT, SERVICES_PERFORMANCE } from '@/lib/queries/analytics';
import { assertUsageNotCut, num, parseScalar } from './_util';
import { unwrapRange } from './coverage';

// ── Traffic Over Time (per service) ─────────────────────────────────────────────
// getServiceUsageJson (top 200 services by settled upokt) answers {range, data}, a JSON scalar → parseScalar.
// Default chart metric = estimated computed units (the demand signal).

interface RelayPointRaw {
  bucket_start: string;
  service_id: string;
  estimated_compute_units: number | string;
}


export interface TrafficSeries {
  interval: 'hour' | 'day' | 'week';
  /** Recharts-ready rows: { date, total, [serviceId]: estimatedCU }. */
  rows: Array<Record<string, number | string>>;
  /** Services present in the window, sorted by total estimated CU desc. */
  services: Array<{ id: string; total: number }>;
}

export async function getTrafficSeries(range: RangeKey, now?: number): Promise<TrafficSeries> {
  const w = rangeWindow(range, now);
  const data = await gqlFetch<{ getServiceUsageJson: unknown }>(
    NETWORK,
    RELAYS_BY_SERVICE_PER_POINT,
    { start: w.startISO, end: w.endISO, interval: w.interval },
    { revalidate: rangeTTL(range) },
  );
  const raw = unwrapRange<RelayPointRaw[]>(parseScalar(data.getServiceUsageJson), false).data ?? [];
  assertUsageNotCut(raw.map((p) => p.service_id));

  const byDate = new Map<string, Record<string, number | string>>();
  const totalByService = new Map<string, number>();

  for (const p of raw) {
    const dISO = toDate(p.bucket_start)?.toISOString() ?? p.bucket_start;
    const val = num(p.estimated_compute_units);
    let row = byDate.get(dISO);
    if (!row) {
      row = { date: dISO, total: 0 };
      byDate.set(dISO, row);
    }
    row[p.service_id] = num(row[p.service_id]) + val;
    row.total = num(row.total) + val;
    totalByService.set(p.service_id, (totalByService.get(p.service_id) ?? 0) + val);
  }

  const rows = [...byDate.keys()].sort().map((d) => byDate.get(d)!);
  const services = [...totalByService.entries()]
    .map(([id, total]) => ({ id, total }))
    .sort((a, b) => b.total - a.total);

  return { interval: w.interval, rows, services };
}

// ── Service Performance (table + distribution donut) ────────────────────────────
// One request with the window's and the previous window's usage per service (getServiceUsageJson), the staked
// suppliers and applications now (getServiceSummaryList) and the service names. `change` is current vs previous
// estimated compute units, 1 when the previous window has none; the window's own services are those with settled
// claims in it, as before.

interface UsageRaw {
  service_id: string;
  relays: number | string;
  estimated_relays: number | string;
  compute_units: number | string;
  estimated_compute_units: number | string;
  settled_upokt: number | string;
}

interface SummaryRaw {
  serviceId: string;
  stakedSuppliers: number | string;
  stakedApplications: number | string;
}

export interface ServicePerf {
  serviceId: string;
  serviceName: string;
  /** % change in this period vs the equal-length previous period (precomputed by the resolver). */
  change: number;
  /** share of total estimated CU across all services this window (%). */
  sharePct: number;
  computedUnits: number;
  estimatedComputedUnits: number;
  relays: number;
  estimatedRelays: number;
  claimedUpokt: number;
  appsStaked: number;
  suppliersStaked: number;
}

export async function getServicesPerformance(range: RangeKey, now?: number): Promise<ServicePerf[]> {
  const w = rangeWindow(range, now);
  const data = await gqlFetch<{
    cur: unknown;
    prev: unknown;
    summary: SummaryRaw[];
    names: { nodes: Array<{ id: string; name: string | null }> };
  }>(
    NETWORK,
    SERVICES_PERFORMANCE,
    { endCurrent: w.endISO, mid: w.startISO, startPrev: w.prevStartISO },
    { revalidate: rangeTTL(range) },
  );
  const cur = unwrapRange<UsageRaw[]>(parseScalar(data.cur), false).data ?? [];
  assertUsageNotCut(cur.map((r) => r.service_id));
  const prevCU = new Map(
    (unwrapRange<UsageRaw[]>(parseScalar(data.prev), false).data ?? []).map((r) => [r.service_id, num(r.estimated_compute_units)]),
  );
  const staked = new Map((data.summary ?? []).map((s) => [s.serviceId, s]));
  const names = new Map((data.names?.nodes ?? []).map((s) => [s.id, s.name ?? '']));

  const rows: ServicePerf[] = cur.map((r) => {
    const previous = prevCU.get(r.service_id);
    const now = num(r.estimated_compute_units);
    return {
      serviceId: r.service_id,
      serviceName: names.get(r.service_id) ?? '',
      change: previous ? (now - previous) / previous : 1,
      sharePct: 0,
      computedUnits: num(r.compute_units),
      estimatedComputedUnits: now,
      relays: num(r.relays),
      estimatedRelays: num(r.estimated_relays),
      claimedUpokt: num(r.settled_upokt),
      appsStaked: num(staked.get(r.service_id)?.stakedApplications),
      suppliersStaked: num(staked.get(r.service_id)?.stakedSuppliers),
    };
  });

  const totalCU = rows.reduce((s, r) => s + r.estimatedComputedUnits, 0) || 1;
  for (const r of rows) r.sharePct = (r.estimatedComputedUnits / totalCU) * 100;
  rows.sort((a, b) => b.sharePct - a.sharePct);
  return rows;
}
