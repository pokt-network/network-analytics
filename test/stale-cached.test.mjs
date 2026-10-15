// staleCached through Next's own unstable_cache and after(): a stale entry is served at once and rebuilt once, after the
// response; a value too old to serve is built by the request itself and kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextCache, request } from './next-request.mjs';

const { staleCached } = await import('../lib/window-cache.ts');

const TTL = 60;

function counter() {
  let n = 0;
  const build = async () => ({ __diagBuiltAt: Date.now(), data: ++n });
  return { build, count: () => n };
}

test('a stale entry is served at once and rebuilt once after the response, however many requests read it', async () => {
  const cache = nextCache();
  try {
    const { build, count } = counter();
    const first = await request(cache, () => staleCached(['t1'], TTL, build));
    await first.drain();
    assert.equal(first.result.data, 1);
    cache.advance(TTL + 5);
    const a = await request(cache, () => staleCached(['t1'], TTL, build));
    const b = await request(cache, () => staleCached(['t1'], TTL, build));
    assert.equal(a.result.data, 1, 'the stale value, at once');
    assert.equal(b.result.data, 1);
    assert.equal(count(), 1, 'nothing built before the responses');
    assert.equal(a.queued + b.queued, 1, 'one refresh queued for the two requests');
    await a.drain();
    await b.drain();
    assert.equal(count(), 2, 'one build, after the response');
    const c = await request(cache, () => staleCached(['t1'], TTL, build));
    assert.equal(c.result.data, 2, 'the next request reads the rebuilt value');
    assert.equal(c.queued, 0);
  } finally {
    cache.restore();
  }
});

test('a value too old to serve is built by the request, kept, and not built again after it', async () => {
  const cache = nextCache();
  try {
    const { build, count } = counter();
    const tooOld = (v, at) => at - v.__diagBuiltAt > 2 * TTL * 1000;
    await (await request(cache, () => staleCached(['t2'], TTL, build, tooOld))).drain();
    cache.advance(3 * TTL);
    const r = await request(cache, () => staleCached(['t2'], TTL, build, tooOld));
    assert.equal(r.result.data, 2, 'built by the request');
    await r.drain();
    assert.equal(count(), 2, 'the drain stored that value, with no second build');
    const next = await request(cache, () => staleCached(['t2'], TTL, build, tooOld));
    assert.equal(next.result.data, 2);
    assert.equal(next.queued, 0);
  } finally {
    cache.restore();
  }
});

test('a build that throws stores nothing, and a failed refresh keeps the stale value', async () => {
  const cache = nextCache();
  try {
    let fail = true;
    const build = async () => {
      if (fail) throw new Error('indexer error');
      return { __diagBuiltAt: Date.now(), data: 'good' };
    };
    await assert.rejects(request(cache, () => staleCached(['t3'], TTL, build)), /indexer error/);
    fail = false;
    const ok = await request(cache, () => staleCached(['t3'], TTL, build));
    assert.equal(ok.result.data, 'good');
    await ok.drain();
    cache.advance(TTL + 5);
    fail = true;
    const stale = await request(cache, () => staleCached(['t3'], TTL, build));
    assert.equal(stale.result.data, 'good');
    await assert.rejects(stale.drain(), /indexer error/);
    const again = await request(cache, () => staleCached(['t3'], TTL, build));
    assert.equal(again.result.data, 'good', 'still the last good value');
    assert.equal(again.queued, 1, 'and the next request tries the refresh again');
  } finally {
    cache.restore();
  }
});
