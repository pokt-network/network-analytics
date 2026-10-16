import { gqlFetch } from '@/lib/graphql';
import { toDate } from '@/lib/time';
import { NETWORK, type RangeKey } from '@/lib/app-config';
import { rangeWindow, rangeTTL } from '@/lib/timeranges';
import { NETWORK_USAGE_STAKED, SERVICES_USAGE_PAGE, TRAFFIC_OVERVIEW, TRAFFIC_SERIES } from '@/lib/queries/analytics';
import { num, parseScalar } from './_util';
import { unwrapRange } from './coverage';
import { DONUT_TOP, PERF_PAGE_MAX, PERF_PAGE_SIZE, SERIES_DEFAULT, SERIES_MAX, type UsageOrder } from '@/lib/traffic-limits';

// Service usage from the settlement catalog (getServiceUsageJson answers {range, data}, a JSON scalar → parseScalar).
// The network total is summed by the indexer over every service (no cap). Tables read one page at a time, searched and
// ordered by the indexer before paging, so a page is the same rows the old full list showed at that place. The chart
// metric is estimated computed units (the demand signal).

interface RelayPointRaw {
  bucket_start: string;
  service_id: string;
  estimated_relays?: number | string;
  estimated_compute_units: number | string;
  settled_upokt?: number | string;
  staked_suppliers?: number | string;
}

interface UsageRaw {
  service_id: string;
  name: string | null;
  relays: number | string;
  estimated_relays: number | string;
  compute_units: number | string;
  estimated_compute_units: number | string;
  settled_upokt: number | string;
  staked_suppliers: number | string;
  staked_applications: number | string;
  previous_estimated_compute_units: number | string | null;
  total_services: number | string;
}

export interface ServicePerf {
  serviceId: string;
  serviceName: string;
  /** Current vs the equal-length previous period's estimated CU, 1 when the previous period has none (old resolver rule). */
  change: number;
  /** share of the network total's estimated CU this window (%). */
  sharePct: number;
  computedUnits: number;
  estimatedComputedUnits: number;
  relays: number;
  estimatedRelays: number;
  claimedUpokt: number;
  appsStaked: number;
  suppliersStaked: number;
}

export interface PerfPage {
  rows: ServicePerf[];
  /** Services with usage in the window that match the search: the table's row count. */
  totalServices: number;
  page: number;
  pageSize: number;
}

export interface UsageQuery {
  page: number;
  pageSize: number;
  order: UsageOrder;
  dir: 'asc' | 'desc';
  search: string;
}

export const DEFAULT_USAGE_QUERY: Omit<UsageQuery, 'pageSize'> = { page: 1, order: 'estimated_compute_units', dir: 'desc', search: '' };

const usage = <T>(v: unknown): T[] => unwrapRange<T[]>(parseScalar(v), false).data ?? [];

/** The network total's estimated compute units from its single row or its buckets. */
const networkCU = (total: RelayPointRaw[]) => total.reduce((s, p) => s + num(p.estimated_compute_units), 0);

function toPerf(r: UsageRaw, totalCU: number): ServicePerf {
  const cu = num(r.estimated_compute_units);
  const previous = num(r.previous_estimated_compute_units);
  return {
    serviceId: r.service_id,
    serviceName: r.name ?? '',
    change: previous ? (cu - previous) / previous : 1,
    sharePct: (cu / (totalCU || 1)) * 100,
    computedUnits: num(r.compute_units),
    estimatedComputedUnits: cu,
    relays: num(r.relays),
    estimatedRelays: num(r.estimated_relays),
    claimedUpokt: num(r.settled_upokt),
    appsStaked: num(r.staked_applications),
    suppliersStaked: num(r.staked_suppliers),
  };
}

function pageVars(q: UsageQuery, w: ReturnType<typeof rangeWindow>) {
  return {
    pageSize: q.pageSize,
    offset: (q.page - 1) * q.pageSize,
    orderBy: q.order,
    orderDir: q.dir,
    searchText: q.search.trim() || null,
    compareStart: w.prevStartISO,
  };
}

const toPage = (rows: UsageRaw[], totalCU: number, q: UsageQuery): PerfPage => ({
  rows: rows.map((r) => toPerf(r, totalCU)),
  totalServices: num(rows[0]?.total_services),
  page: q.page,
  pageSize: q.pageSize,
});

/** One page of a services table (Traffic's Service Performance, the Services tab), searched and ordered by the indexer. */
export async function getServicesPage(range: RangeKey, q: UsageQuery, now?: number): Promise<PerfPage> {
  const w = rangeWindow(range, now);
  const data = await gqlFetch<{ total: unknown; page: unknown }>(
    NETWORK,
    SERVICES_USAGE_PAGE,
    { start: w.startISO, end: w.endISO, ...pageVars(q, w) },
    { revalidate: rangeTTL(range) },
  );
  return toPage(usage<UsageRaw>(data.page), networkCU(usage<RelayPointRaw>(data.total)), q);
}

/** Every row of a services table in its order (the CSV export), in pages of 200 until the count. */
export async function getAllServices(range: RangeKey, q: Omit<UsageQuery, 'page' | 'pageSize'>, now?: number): Promise<ServicePerf[]> {
  const out: ServicePerf[] = [];
  for (let page = 1; ; page++) {
    const p = await getServicesPage(range, { ...q, page, pageSize: PERF_PAGE_MAX }, now);
    out.push(...p.rows);
    if (p.rows.length < PERF_PAGE_MAX || out.length >= p.totalServices) return out;
  }
}

// ── Traffic tab ─────────────────────────────────────────────────────────────────
// The chart shows the top 5 services by default and at most 20 chosen ones, each read naming its services; the
// distribution is the table's first slices plus the rest of the network total.

export interface TrafficOverview {
  interval: 'hour' | 'day' | 'week';
  /** Recharts-ready rows: { date, total, [serviceId]: estimatedCU } for the network total and the top services. */
  rows: Array<Record<string, number | string>>;
  /** The top services in the window, by total estimated CU desc. */
  services: Array<{ id: string; total: number }>;
  page: PerfPage;
  donut: Array<{ serviceId: string; name: string; sharePct: number }>;
}

/** Points per bucket into chart rows keyed by date; `key` names the column a point goes to. */
function toRows(points: RelayPointRaw[], key: (p: RelayPointRaw) => string, rows = new Map<string, Record<string, number | string>>()) {
  for (const p of points) {
    const date = toDate(p.bucket_start)?.toISOString() ?? p.bucket_start;
    let row = rows.get(date);
    if (!row) {
      row = { date };
      rows.set(date, row);
    }
    row[key(p)] = num(row[key(p)]) + num(p.estimated_compute_units);
  }
  return rows;
}

/** The Traffic tab's first view in one request: the network total and top-5 series, the table's first page, the distribution. */
export async function getTrafficOverview(range: RangeKey, now?: number): Promise<TrafficOverview> {
  const w = rangeWindow(range, now);
  const q: UsageQuery = { ...DEFAULT_USAGE_QUERY, pageSize: PERF_PAGE_SIZE };
  const data = await gqlFetch<{ total: unknown; series: unknown; page: unknown }>(
    NETWORK,
    TRAFFIC_OVERVIEW,
    { start: w.startISO, end: w.endISO, interval: w.interval, seriesTop: SERIES_DEFAULT, ...pageVars(q, w) },
    { revalidate: rangeTTL(range) },
  );
  const total = usage<RelayPointRaw>(data.total);
  const series = usage<RelayPointRaw>(data.series);
  const totalCU = networkCU(total);

  const byDate = toRows(series, (p) => p.service_id, toRows(total, () => 'total'));
  const rows = [...byDate.keys()].sort().map((d) => byDate.get(d)!);
  const totals = new Map<string, number>();
  for (const p of series) totals.set(p.service_id, (totals.get(p.service_id) ?? 0) + num(p.estimated_compute_units));
  const services = [...totals.entries()].map(([id, t]) => ({ id, total: t })).sort((a, b) => b.total - a.total);

  const page = toPage(usage<UsageRaw>(data.page), totalCU, q);
  const top = page.rows.slice(0, DONUT_TOP).map((p) => ({ serviceId: p.serviceId, name: p.serviceName || p.serviceId, sharePct: p.sharePct }));
  const othersShare = totalCU > 0 ? Math.max(0, 100 - top.reduce((s, p) => s + p.sharePct, 0)) : 0;
  const donut = othersShare > 0 ? [...top, { serviceId: '__others__', name: 'others', sharePct: othersShare }] : top;

  return { interval: w.interval, rows, services, page, donut };
}

/** The active services in ranking order (the chart's service selector and its colors). */
export async function getActiveServices(range: RangeKey, now?: number): Promise<Array<{ id: string; total: number }>> {
  const all = await getAllServices(range, DEFAULT_USAGE_QUERY, now);
  return all.map((r) => ({ id: r.serviceId, total: r.estimatedComputedUnits }));
}

/** The chosen services' series (at most SERIES_MAX), rows keyed by date. */
export async function getServicesSeries(range: RangeKey, services: string[], now?: number): Promise<Array<Record<string, number | string>>> {
  if (services.length === 0) return [];
  if (services.length > SERIES_MAX) throw new Error(`at most ${SERIES_MAX} services in the chart`);
  const w = rangeWindow(range, now);
  const data = await gqlFetch<{ getServiceUsageJson: unknown }>(
    NETWORK,
    TRAFFIC_SERIES,
    { services, start: w.startISO, end: w.endISO, interval: w.interval },
    { revalidate: rangeTTL(range) },
  );
  const byDate = toRows(usage<RelayPointRaw>(data.getServiceUsageJson), (p) => p.service_id);
  return [...byDate.keys()].sort().map((d) => byDate.get(d)!);
}

/** Σ staked suppliers over the services with usage in the window (each supplier counted once per service it runs). */
export async function getActiveServiceConfigs(range: RangeKey, now?: number): Promise<number> {
  const w = rangeWindow(range, now);
  const data = await gqlFetch<{ getServiceUsageJson: unknown }>(
    NETWORK,
    NETWORK_USAGE_STAKED,
    { start: w.startISO, end: w.endISO, interval: null },
    { revalidate: rangeTTL(range) },
  );
  return usage<RelayPointRaw>(data.getServiceUsageJson).reduce((s, p) => s + num(p.staked_suppliers), 0);
}
