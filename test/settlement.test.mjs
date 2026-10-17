// Reward windows end at the last fully written settlement: the same variables (so the same cache entry) within one
// settlement whatever the minute, new ones on a new fully written settlement, and none while that block is half written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';

globalThis.AsyncLocalStorage = AsyncLocalStorage;
const { settledOf, settledWindow } = await import('../lib/data/settlement.ts');
const { getRewardsWindow } = await import('../lib/data/owner.ts');

const S1 = { height: '966333', blockTime: '2026-10-15T21:19:37.95+00:00' };
const S2 = { height: '966353', blockTime: '2026-10-15T21:29:41.123456+00:00' };

test('the window ends at the settlement block: inclusive at its time, half-open 1 µs after it', () => {
  const s = { height: 966333, blockTime: S1.blockTime };
  const inc = settledWindow(24 * 3600, s, true);
  assert.equal(inc.endISO, '2026-10-15T21:19:37.950000Z');
  assert.equal(inc.startISO, '2026-10-14T21:19:37.950000Z');
  const open = settledWindow('7d', s, false);
  assert.equal(open.endISO, '2026-10-15T21:19:37.950001Z');
  assert.equal(open.startISO, '2026-10-08T21:19:37.950001Z');
});

test('a settlement above the last processed height (its block half written) keeps the previous one', () => {
  const prev = { height: 966333, blockTime: S1.blockTime };
  assert.deepEqual(settledOf({ getLastSettlement: S2, _metadata: { lastProcessedHeight: 966352 } }, prev), prev);
  assert.deepEqual(settledOf({ getLastSettlement: S2, _metadata: { lastProcessedHeight: 966353 } }, prev), { height: 966353, blockTime: S2.blockTime });
  assert.equal(settledOf({ getLastSettlement: S2, _metadata: { lastProcessedHeight: 966352 } }, null), null);
});

test('getRewardsWindow: the same variables across minutes within a settlement, new ones only once the next is fully written', async () => {
  const realFetch = globalThis.fetch;
  const realNow = Date.now;
  let chain = { getLastSettlement: S1, _metadata: { lastProcessedHeight: 966340 } };
  const rewards = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    const data = /query lastSettlement\b/.test(body.query) ? chain : (rewards.push(body.variables), { legacyRewardsByAddressesAndTime: '{"range":null,"data":"0"}' });
    return new Response(JSON.stringify({ data }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const t0 = Date.parse('2026-10-15T21:30:10Z');
  try {
    Date.now = () => t0;
    await getRewardsWindow(['pokt1a'], 24 * 3600);
    Date.now = () => t0 + 5 * 60_000; // five minutes later, same settlement
    await getRewardsWindow(['pokt1a'], 24 * 3600);
    assert.deepEqual(rewards[1], rewards[0], 'same variables: one cache entry');
    chain = { getLastSettlement: S2, _metadata: { lastProcessedHeight: 966352 } }; // S2's block still being written
    await getRewardsWindow(['pokt1a'], 24 * 3600);
    assert.deepEqual(rewards[2], rewards[0], 'no new key while the block is half written');
    chain = { getLastSettlement: S2, _metadata: { lastProcessedHeight: 966353 } };
    await getRewardsWindow(['pokt1a'], 24 * 3600);
    assert.notDeepEqual(rewards[3], rewards[0]);
    assert.equal(rewards[3].end, '2026-10-15T21:29:41.123456Z', 'a new key ending at the new settlement');
  } finally {
    globalThis.fetch = realFetch;
    Date.now = realNow;
  }
});
