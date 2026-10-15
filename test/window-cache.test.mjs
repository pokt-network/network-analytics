// Range caches keep a stable key, so stale-while-revalidate answers at once and rebuilds after the response; a value
// whose window ended more than two TTLs ago (only after a long quiet stretch) is not served: that request builds its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';

globalThis.AsyncLocalStorage = AsyncLocalStorage;
const { serveCached, serveWindow, tooOld } = await import('../lib/window-cache.ts');

const TTL = 600;
const t = Date.parse('2026-10-15T12:00:00Z');
const env = (windowEnd, data) => ({ __diagBuiltAt: windowEnd, windowEnd, data });

test('a value built within one TTL is served as is, with no build and no refresh', async () => {
  let builds = 0;
  const refreshes = [];
  const cached = env(t - 5 * 60_000, 'cached'); // 5 min old (TTL 10 min)
  const out = await serveWindow(async () => cached, async () => (builds++, env(t, 'fresh')), (b) => refreshes.push(b), TTL, () => t);
  assert.equal(out.data, 'cached');
  assert.equal(builds, 0);
  assert.equal(refreshes.length, 0);
});

test('a stale value within two TTLs is served at once and refreshed after the response, with no build of its own', async () => {
  let builds = 0;
  const refreshes = [];
  const cached = env(t - 15 * 60_000, 'cached'); // 15 min old: stale (TTL 10 min), within 2x
  const out = await serveWindow(async () => cached, async () => (builds++, env(t, 'fresh')), (b) => refreshes.push(b), TTL, () => t);
  assert.equal(out.data, 'cached');
  assert.equal(builds, 0);
  assert.deepEqual(refreshes, [undefined]); // the refresh builds its own value, later
});

test('a value whose window ended more than two TTLs ago is not served: the request builds its own, and the cache keeps it', async () => {
  let builds = 0;
  const refreshes = [];
  const cached = env(t - 3 * 3_600_000, 'three hours old');
  const out = await serveWindow(async () => cached, async () => (builds++, env(t, 'fresh')), (b) => refreshes.push(b), TTL, () => t);
  assert.equal(out.data, 'fresh');
  assert.equal(builds, 1);
  assert.equal(refreshes.length, 1);
  assert.equal(refreshes[0], out); // stored as is: no second build
});

test('the edge, and a value with no window (written before this cache carried one)', () => {
  assert.equal(tooOld(t - 2 * TTL * 1000, TTL, t), false);
  assert.equal(tooOld(t - 2 * TTL * 1000 - 1, TTL, t), true);
  assert.equal(tooOld(undefined, TTL, t), true);
});

test('serveCached with a rule that never says too old serves a stale value of any age at once and refreshes it after', async () => {
  let builds = 0;
  const refreshes = [];
  const cached = { __diagBuiltAt: t - 3 * 3_600_000, data: 'three hours old' };
  const out = await serveCached(async () => cached, async () => (builds++, { __diagBuiltAt: t, data: 'fresh' }), (b) => refreshes.push(b), 30, () => false, () => t);
  assert.equal(out.data, 'three hours old');
  assert.equal(builds, 0);
  assert.deepEqual(refreshes, [undefined]);
});
