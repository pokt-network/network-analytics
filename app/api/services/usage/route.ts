import { type NextRequest } from 'next/server';
import { rangeCached } from '@/lib/window-cache';
import { getServicesPage } from '@/lib/data/traffic';
import { rangeTTL } from '@/lib/timeranges';
import { DEFAULT_RANGE, isRangeKey, type RangeKey } from '@/lib/app-config';
import { isUsageOrder, PERF_PAGE_MAX, PERF_PAGE_SIZE } from '@/lib/traffic-limits';
import { diagJson } from '@/lib/diagnostics';

// One page of a services table (Traffic's Service Performance, the Services tab's Service Analytics): the services with
// usage in the range, searched (`q`, id or name) and ordered (`order`, `dir`) by the indexer, `size` rows (up to 200, for
// the CSV export) of page `page`.
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const rangeParam = p.get('range');
  const range: RangeKey = isRangeKey(rangeParam) ? rangeParam : DEFAULT_RANGE;
  const page = Math.min(Math.max(1, Math.floor(Number(p.get('page')) || 1)), 100_000);
  const pageSize = Math.min(Math.max(1, Math.floor(Number(p.get('size')) || PERF_PAGE_SIZE)), PERF_PAGE_MAX);
  const orderParam = p.get('order');
  const order = isUsageOrder(orderParam) ? orderParam : 'estimated_compute_units';
  const dir = p.get('dir') === 'asc' ? 'asc' : 'desc';
  const search = (p.get('q') ?? '').trim().slice(0, 100);
  return diagJson('services-usage', () =>
    rangeCached(
      ['services-usage', 'w1', String(pageSize), String(page), order, dir, search],
      range,
      rangeTTL(range),
      (now) => getServicesPage(range, { page, pageSize, order, dir, search }, now),
    ),
  );
}
