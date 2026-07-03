import { gqlFetch } from '@/lib/graphql';
import { toDate } from '@/lib/time';
import { NETWORK, type RangeKey } from '@/lib/app-config';
import { rangeWindow, rangeTTL } from '@/lib/timeranges';
import { RELAYS_BY_SERVICE_PER_POINT, SERVICES_PERFORMANCE } from '@/lib/queries/analytics';
import { num, parseScalar } from './_util';

// ── Traffic Over Time (per service) ─────────────────────────────────────────────
// getRelaysByServicePerPointJson returns a DOUBLE-ENCODED JSON string → parseScalar.
// Default chart metric = estimated computed units (the demand signal).

interface RelayPointRaw {
  date_truncated: string;
  service_id: string;
  relays: number | string;
  estimated_relays: number | string;
  computed_units: number | string;
  estimated_computed_units: number | string;
  claimed_upokt: number | string;
}

export interface TrafficSeries {
  interval: 'hour' | 'day' | 'week';
  /** Recharts-ready rows: { date, total, [serviceId]: estimatedCU }. */
  rows: Array<Record<string, number | string>>;
  /** Services present in the window, sorted by total estimated CU desc. */
  services: Array<{ id: string; total: number }>;
}

export async function getTrafficSeries(range: RangeKey): Promise<TrafficSeries> {
  const w = rangeWindow(range);
  const data = await gqlFetch<{ getRelaysByServicePerPointJson: unknown }>(
    NETWORK,
    RELAYS_BY_SERVICE_PER_POINT,
    { start: w.startISO, end: w.endISO, interval: w.interval },
    { revalidate: rangeTTL(range) },
  );
  const raw = parseScalar<RelayPointRaw[]>(data.getRelaysByServicePerPointJson);

  const byDate = new Map<string, Record<string, number | string>>();
  const totalByService = new Map<string, number>();

  for (const p of raw) {
    const dISO = toDate(p.date_truncated)?.toISOString() ?? p.date_truncated;
    const val = num(p.estimated_computed_units);
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
// servicesPerformanceBetweenTimes: `change` is precomputed current-vs-previous (why it takes 3
// timestamps). Native array (not double-encoded), but coerce defensively.

interface PerfRaw {
  change: number | string;
  relays: number | string;
  service_id: string;
  service_name: string;
  apps_staked: number | string;
  claimed_upokt: number | string;
  computed_units: number | string;
  estimated_relays: number | string;
  suppliers_staked: number | string;
  estimated_computed_units: number | string;
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

export async function getServicesPerformance(range: RangeKey): Promise<ServicePerf[]> {
  const w = rangeWindow(range);
  const data = await gqlFetch<{ servicesPerformanceBetweenTimes: unknown }>(
    NETWORK,
    SERVICES_PERFORMANCE,
    { endCurrent: w.endISO, mid: w.startISO, startPrev: w.prevStartISO },
    { revalidate: rangeTTL(range) },
  );
  const raw = parseScalar<PerfRaw[]>(data.servicesPerformanceBetweenTimes);

  const rows: ServicePerf[] = raw.map((r) => ({
    serviceId: r.service_id,
    serviceName: r.service_name,
    change: num(r.change),
    sharePct: 0,
    computedUnits: num(r.computed_units),
    estimatedComputedUnits: num(r.estimated_computed_units),
    relays: num(r.relays),
    estimatedRelays: num(r.estimated_relays),
    claimedUpokt: num(r.claimed_upokt),
    appsStaked: num(r.apps_staked),
    suppliersStaked: num(r.suppliers_staked),
  }));

  const totalCU = rows.reduce((s, r) => s + r.estimatedComputedUnits, 0) || 1;
  for (const r of rows) r.sharePct = (r.estimatedComputedUnits / totalCU) * 100;
  rows.sort((a, b) => b.sharePct - a.sharePct);
  return rows;
}
