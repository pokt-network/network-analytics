// The traffic and service reads on the settlement catalog: the shapes they send and how they map the answers
// (checked against the old resolvers on mainnet, 2026-10-16: identical values).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';

globalThis.AsyncLocalStorage = AsyncLocalStorage;
const { getTrafficOverview, getServicesPage, getAllServices, getServicesSeries, getActiveServices, getActiveServiceConfigs } = await import('../lib/data/traffic.ts');
const { getServiceDetail } = await import('../lib/data/services.ts');
const { getRolling24hStats } = await import('../lib/data/rewards.ts');

const range = { requested_from: null, requested_to: null, covered_from: 'a', covered_to: 'b', gaps: [] };
const row = (service_id, cu, extra = {}) => ({
  service_id,
  name: service_id === 'eth' ? 'Ethereum' : null,
  relays: '1',
  estimated_relays: '2',
  compute_units: '3',
  estimated_compute_units: String(cu),
  settled_upokt: '5',
  staked_suppliers: '7',
  staked_applications: '3',
  previous_estimated_compute_units: null,
  ...extra,
});

// `data` answers every request, or is a function of the request body (one answer per document).
async function withAnswer(data, fn) {
  const realFetch = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    asked.push(body);
    const answer = typeof data === 'function' ? data(body) : data;
    return new Response(JSON.stringify({ data: answer }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    return { result: await fn(), asked };
  } finally {
    globalThis.fetch = realFetch;
  }
}

const T = 1_790_000_000_000;
const pt = (date, service_id, cu, extra = {}) => ({ bucket_start: date, service_id, estimated_compute_units: String(cu), ...extra });

test('traffic overview: network total from the indexer, top series, first page and the distribution in one request', async () => {
  const { result, asked } = await withAnswer(
    {
      // the network total holds services that are in no page or series: it is not a sum of what the page holds
      total: { range, data: [pt('2026-10-15T00:00:00+00:00', 'all', 600), pt('2026-10-16T00:00:00+00:00', 'all', 400)] },
      series: { range, data: [pt('2026-10-15T00:00:00+00:00', 'eth', 300), pt('2026-10-16T00:00:00+00:00', 'eth', 200), pt('2026-10-16T00:00:00+00:00', 'base', 100)] },
      page: { range, data: [row('eth', 500, { total_services: '12', previous_estimated_compute_units: '250' }), row('base', 100, { total_services: '12' })] },
    },
    () => getTrafficOverview('7d', T),
  );
  assert.equal(asked.length, 1);
  const v = asked[0].variables;
  assert.deepEqual([v.interval, v.seriesTop, v.pageSize, v.offset, v.orderBy, v.orderDir, v.searchText], ['day', 5, 10, 0, 'estimated_compute_units', 'desc', null]);
  assert.equal(v.compareStart, new Date(Date.parse(v.start) - (Date.parse(v.end) - Date.parse(v.start))).toISOString(), 'the previous equal-length window');
  assert.deepEqual(result.rows, [
    { date: '2026-10-15T00:00:00.000Z', total: 600, eth: 300 },
    { date: '2026-10-16T00:00:00.000Z', total: 400, eth: 200, base: 100 },
  ]);
  assert.deepEqual(result.services.map((s) => s.id), ['eth', 'base']);
  assert.equal(result.page.totalServices, 12);
  const [eth, base] = result.page.rows;
  assert.equal(eth.sharePct, 50, 'share of the network total');
  assert.equal(eth.change, 1, '(500 - 250) / 250');
  assert.equal(base.change, 1, 'no previous activity: 1, as the old resolver');
  assert.equal(eth.serviceName, 'Ethereum');
  assert.equal(base.serviceName, '');
  assert.deepEqual([eth.suppliersStaked, eth.appsStaked, eth.claimedUpokt], [7, 3, 5]);
  assert.deepEqual(
    result.donut.map((d) => [d.serviceId, d.sharePct]),
    [['eth', 50], ['base', 10], ['__others__', 40]],
    'others = the network total less the top slices',
  );
});

test('services page: offset from the page number, search and order passed to the indexer, share of the network total', async () => {
  const { result, asked } = await withAnswer(
    { total: { range, data: [pt(null, 'all', 1000)] }, page: { range, data: [row('base', 100, { total_services: '31' })] } },
    () => getServicesPage('30d', { page: 3, pageSize: 50, order: 'staked_suppliers', dir: 'asc', search: '  eth ' }, T),
  );
  assert.equal(asked.length, 1);
  const v = asked[0].variables;
  assert.deepEqual([v.offset, v.pageSize, v.orderBy, v.orderDir, v.searchText], [100, 50, 'staked_suppliers', 'asc', 'eth']);
  assert.equal(result.totalServices, 31);
  assert.equal(result.rows[0].sharePct, 10);
  const empty = await withAnswer({ total: { range, data: [] }, page: { range, data: [] } }, () => getServicesPage('30d', { page: 9, pageSize: 10, order: 'name', dir: 'desc', search: '' }, T));
  assert.deepEqual([empty.result.rows, empty.result.totalServices], [[], 0]);
});

test('all services (CSV, selector): pages of 200 in order until the count; one request for 164', async () => {
  const page = (from, n, total) => Array.from({ length: n }, (_, i) => row(`s${from + i}`, 1000 - from - i, { total_services: String(total) }));
  const { result, asked } = await withAnswer(
    (b) => ({ total: { range, data: [] }, page: { range, data: b.variables.offset === 0 ? page(0, 200, 230) : page(200, 30, 230) } }),
    () => getAllServices('30d', { order: 'name', dir: 'asc', search: 'x' }, T),
  );
  assert.deepEqual(asked.map((a) => [a.variables.offset, a.variables.pageSize, a.variables.orderBy, a.variables.searchText]), [[0, 200, 'name', 'x'], [200, 200, 'name', 'x']]);
  assert.equal(result.length, 230);
  const one = await withAnswer({ total: { range, data: [] }, page: { range, data: page(0, 164, 164) } }, () => getActiveServices('24h', T));
  assert.equal(one.asked.length, 1);
  assert.equal(one.asked[0].variables.orderBy, 'estimated_compute_units');
  assert.deepEqual(one.result.slice(0, 2), [{ id: 's0', total: 1000 }, { id: 's1', total: 999 }]);
});

test('picked series: the named services only, at most 20', async () => {
  const { result, asked } = await withAnswer({ getServiceUsageJson: { range, data: [pt('2026-10-15T00:00:00+00:00', 'op', 7)] } }, () => getServicesSeries('7d', ['op'], T));
  assert.deepEqual(asked[0].variables.services, ['op']);
  assert.deepEqual(result, [{ date: '2026-10-15T00:00:00.000Z', op: 7 }]);
  const many = Array.from({ length: 21 }, (_, i) => `s${i}`);
  await assert.rejects(getServicesSeries('7d', many, T), /at most 20/);
});

test('suppliers tab: staked suppliers summed over the active services, from the network total row', async () => {
  const { result, asked } = await withAnswer({ getServiceUsageJson: { range, data: [pt(null, 'all', 10, { staked_suppliers: '2873' })] } }, () => getActiveServiceConfigs('7d', T));
  assert.match(asked[0].query, /byService: false/);
  assert.equal(asked[0].variables.interval, null);
  assert.equal(result, 2873);
});

test('service detail: its row, the network total and its series in one request', async () => {
  const answer = {
    row: { range, data: [row('eth', 250)] },
    total: { range, data: [pt(null, 'all', 1000)] },
    series: { range, data: [pt('2026-10-16T00:00:00+00:00', 'eth', 150, { estimated_relays: '1', settled_upokt: '2000000' }), pt('2026-10-15T00:00:00+00:00', 'eth', 100, { estimated_relays: '1', settled_upokt: '1000000' })] },
  };
  const { result, asked } = await withAnswer(answer, () => getServiceDetail('eth', '7d', T));
  assert.equal(asked.length, 1);
  assert.equal(asked[0].variables.service, 'eth');
  assert.deepEqual(result.info, { id: 'eth', name: 'Ethereum', appsStaked: 3, suppliersStaked: 7, sharePct: 25 });
  assert.deepEqual(result.stats, { cu: 250, relays: 2, suppliers: 7, grossRewardsPokt: 3 });
  assert.deepEqual(result.series.map((p) => p.date), ['2026-10-15T00:00:00.000Z', '2026-10-16T00:00:00.000Z']);
  // a service with no usage in the window: no row, zeros and its id as the name, as before
  const quiet = await withAnswer({ row: { range, data: [] }, total: answer.total, series: { range, data: [] } }, () => getServiceDetail('quiet', '7d', T));
  assert.deepEqual(quiet.result.info, { id: 'quiet', name: 'quiet', appsStaked: 0, suppliersStaked: 0, sharePct: 0 });
});
test('24h cards: the network total per hour, trailing 24h against the 24h before', async () => {
  const realNow = Date.now;
  Date.now = () => T;
  try {
    const h = (ago) => new Date(T - ago * 3600_000).toISOString();
    const { result, asked } = await withAnswer(
      { getServiceUsageJson: { range, data: [pt(h(1), 'all', 30, { estimated_relays: '3' }), pt(h(30), 'all', 20, { estimated_relays: '2' })] } },
      () => getRolling24hStats(),
    );
    assert.match(asked[0].query, /byService: false/);
    assert.equal(asked[0].variables.interval, 'hour');
    assert.equal(result.cu24h, 30);
    assert.equal(result.relays24h, 3);
    assert.equal(result.cu24hChange, 50);
  } finally {
    Date.now = realNow;
  }
});
