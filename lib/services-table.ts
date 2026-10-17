// Client side of the server-paged services tables (Traffic's Service Performance, the Services tab): the
// /api/services/usage URL for a table's state, and every matching row for the CSV export.
import type { TableState } from '@/components/ui/DataTable';
import type { PerfPage, ServicePerf } from '@/lib/data/traffic';
import { PERF_PAGE_MAX, type UsageOrder } from '@/lib/traffic-limits';

/** A table's column keys to the order the indexer sorts them by. */
export type ColumnOrders = Record<string, UsageOrder>;

export function usageUrl(range: string, s: TableState, size: number, orders: ColumnOrders): string {
  const q = new URLSearchParams({
    range,
    page: String(s.page),
    size: String(size),
    order: (s.sortKey && orders[s.sortKey]) || 'estimated_compute_units',
    dir: s.sortDir,
  });
  if (s.query.trim()) q.set('q', s.query.trim());
  return `/api/services/usage?${q}`;
}

/** Every row matching the table's search, in its order, read in pages of 200 (one request for today's ~164 services). */
export async function allUsageRows(range: string, s: TableState, orders: ColumnOrders): Promise<ServicePerf[]> {
  const rows: ServicePerf[] = [];
  for (let page = 1; ; page++) {
    const res = await fetch(usageUrl(range, { ...s, page }, PERF_PAGE_MAX, orders));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const p = (await res.json()) as PerfPage;
    rows.push(...p.rows);
    if (p.rows.length < PERF_PAGE_MAX || rows.length >= p.totalServices) return rows;
  }
}
