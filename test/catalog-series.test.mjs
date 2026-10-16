// The traffic and service reads on the settlement catalog: the shapes they send and how they map the answers
// (checked against the old resolvers on mainnet, 2026-10-16: identical values).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';

globalThis.AsyncLocalStorage = AsyncLocalStorage;
const { getServicesPerformance, getTrafficSeries } = await import('../lib/data/traffic.ts');

const range = { requested_from: null, requested_to: null, covered_from: 'a', covered_to: 'b', gaps: [] };
const row = (service_id, cu, extra = {}) => ({ service_id, relays: '1', estimated_relays: '2', compute_units: '3', estimated_compute_units: String(cu), settled_upokt: '5', ...extra });

async function withAnswer(data, fn) {
  const realFetch = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (_url, init) => {
    asked.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    return { result: await fn(), asked };
  } finally {
    globalThis.fetch = realFetch;
  }
}

test('services performance: one request, change against the previous window, counts from the summary, names from services', async () => {
  const { result, asked } = await withAnswer(
    {
      cur: { range, data: [row('eth', 150), row('base', 40)] },
      prev: { range, data: [row('eth', 100)] },
      summary: [{ serviceId: 'eth', stakedSuppliers: '7', stakedApplications: '3' }],
      names: { totalCount: 2, nodes: [{ id: 'eth', name: 'Ethereum' }, { id: 'base', name: null }] },
    },
    () => getServicesPerformance('7d', 1_790_000_000_000),
  );
  assert.equal(asked.length, 1);
  const eth = result.find((r) => r.serviceId === 'eth');
  assert.equal(eth.change, 0.5);
  assert.equal(eth.serviceName, 'Ethereum');
  assert.equal(eth.appsStaked, 3);
  assert.equal(eth.suppliersStaked, 7);
  assert.equal(eth.claimedUpokt, 5);
  const base = result.find((r) => r.serviceId === 'base');
  assert.equal(base.change, 1, 'no activity in the previous window: 1, as the old resolver');
  assert.equal(base.appsStaked, 0);
  assert.equal(base.serviceName, '');
});

test('traffic series: reads the usage bucket_start and refuses an answer that reached the 200-service cap', async () => {
  const bucket = (i) => ({ bucket_start: '2026-10-15T00:00:00+00:00', service_id: `s${i}`, estimated_compute_units: '10' });
  const ok = await withAnswer({ getServiceUsageJson: { range, data: [bucket(1), bucket(2)] } }, () => getTrafficSeries('7d', 1_790_000_000_000));
  assert.equal(ok.result.rows[0].total, 20);
  assert.deepEqual(ok.result.services.map((s) => s.id).sort(), ['s1', 's2']);
  const many = Array.from({ length: 200 }, (_, i) => bucket(i));
  await assert.rejects(withAnswer({ getServiceUsageJson: { range, data: many } }, () => getTrafficSeries('30d', 1_790_000_000_000)), /service cap/);
});
