// Review of 79d31e4..9e72877, client side (lib/use-tab-data.ts): when a settled panel refetches, what height an entry
// belongs to, and which heartbeat heights count.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const tab = await import('../lib/use-tab-data.ts');

const entry = (ageMs, settled) => ({ ts: Date.now() - ageMs, settled });

test('#2 with no settlement known, a settled panel still revalidates by age', () => {
  assert.equal(tab.needsRefetch(entry(61_000, null), { bySettlement: true, settled: null }), true);
  assert.equal(tab.needsRefetch(entry(10_000, null), { bySettlement: true, settled: null }), false);
});

test('a settled panel refetches when the settlement moves past its entry, not by age', () => {
  assert.equal(tab.needsRefetch(entry(600_000, 5), { bySettlement: true, settled: 5 }), false);
  assert.equal(tab.needsRefetch(entry(1_000, 5), { bySettlement: true, settled: 6 }), true);
});

test('#7 a panel with per-block fields as well (alsoByAge) refetches on either', () => {
  assert.equal(tab.needsRefetch(entry(61_000, 5), { bySettlement: true, alsoByAge: true, settled: 5 }), true);
  assert.equal(tab.needsRefetch(entry(1_000, 5), { bySettlement: true, alsoByAge: true, settled: 6 }), true);
  assert.equal(tab.needsRefetch(entry(1_000, 5), { bySettlement: true, alsoByAge: true, settled: 5 }), false);
});

test('#5 a lower height (another instance behind) is ignored', () => {
  tab.setSettledHeight(100);
  tab.setSettledHeight(99);
  assert.equal(tab.currentSettledHeight(), 100);
  tab.setSettledHeight(101);
  assert.equal(tab.currentSettledHeight(), 101);
});

test('#3 an entry belongs to the height known when its request started, not when it arrived', async () => {
  const realFetch = globalThis.fetch;
  tab.setSettledHeight(200);
  globalThis.fetch = () => new Promise((r) => setTimeout(() => r(new Response('{"ok":1}', { status: 200 })), 30));
  try {
    tab.prefetch('/api/test-settled');
    tab.setSettledHeight(201); // the heartbeat moves while the request is out
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(tab.cachedEntry('/api/test-settled')?.settled, 200);
  } finally {
    globalThis.fetch = realFetch;
  }
});
