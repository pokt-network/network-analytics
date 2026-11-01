// The slashing totals count every event of a stretch the settlement tables do not cover: no 1000-row cap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';

globalThis.AsyncLocalStorage = AsyncLocalStorage;
const { getOperatorSlashTotals } = await import('../lib/data/operator.ts');

const T = 1_790_000_000_000;
const iso = (ms) => new Date(ms).toISOString();
const event = (n) => ({ height: String(5000 - n), id: `e${n}`, blockTime: iso(T - 12 * 3_600_000), actorId: 's', penaltyUpokt: '10' });

test('slash totals: an uncovered stretch with more than 1000 events is read page by page, not capped', async () => {
  const realFetch = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (_url, init) => {
    const { query, variables } = JSON.parse(init.body);
    asked.push(variables);
    let data;
    if (/supplierSlashTotals/.test(query)) {
      data = {
        getSupplierPenaltiesJson: { range: { requested_from: iso(T - 86_400_000), requested_to: iso(T), covered_from: null, covered_to: null, gaps: [] }, data: [] },
        tail: { range: { requested_from: iso(T - 3_600_000), requested_to: iso(T), covered_from: iso(T - 3_600_000), covered_to: iso(T + 60_000), gaps: [] }, data: [] },
      };
    } else {
      // two pages of the same stretch: 1000 rows, then the 5 after the last of them
      data = { getActorLifecycleList: variables.beforeHeight ? Array.from({ length: 5 }, (_, i) => event(1000 + i)) : Array.from({ length: 1000 }, (_, i) => event(i)) };
    }
    return new Response(JSON.stringify({ data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const r = await getOperatorSlashTotals(['op'], '24h', T);
    assert.equal(r.totalCount, 1005);
    assert.equal(r.penaltyUpokt, '10050');
    assert.equal(r.capped, false);
    const pages = asked.filter((v) => 'rowLimit' in v);
    assert.deepEqual(pages.map((v) => [v.beforeHeight ?? null, v.beforeId ?? null]), [[null, null], ['4001', 'e999']]);
  } finally {
    globalThis.fetch = realFetch;
  }
});
