// gqlFetch's stale answers in a request: returned at once and read again once, after the response; fresh ones are not
// read again; outside a request (no after()) a stale answer is read again before answering, as unstable_cache does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextCache, request } from './next-request.mjs';

const { gqlFetch } = await import('../lib/graphql.ts');

const Q = 'query ownerTest($o: [String]) { getSupplierFleetList(owners: $o, bySupplier: false) { supplierCount } }';
const answer = (n) => ({ data: { getSupplierFleetList: [{ supplierCount: String(n) }] } });

function countingIndexer() {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(JSON.parse(init.body));
    return new Response(JSON.stringify(answer(calls.length)), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return calls;
}

async function withCache(fn) {
  const realFetch = globalThis.fetch;
  const cache = nextCache();
  try {
    await fn(cache);
  } finally {
    globalThis.fetch = realFetch;
    cache.restore();
  }
}

const read = (o) => gqlFetch('main', Q, { o: [o] }, { revalidate: 60 });
const count = (r) => r.getSupplierFleetList[0].supplierCount;

test('a stale answer is returned at once and read again once after the response; the next request gets the new one', () =>
  withCache(async (cache) => {
    const calls = countingIndexer();
    await (await request(cache, () => read('pokt1a'))).drain();
    assert.equal(calls.length, 1);
    const fresh = await request(cache, () => read('pokt1a'));
    assert.equal(count(fresh.result), '1');
    assert.equal(fresh.queued, 0, 'a fresh answer is not read again');
    cache.advance(65);
    const a = await request(cache, () => read('pokt1a'));
    const b = await request(cache, () => read('pokt1a'));
    assert.equal(count(a.result), '1', 'the stale answer, at once');
    assert.equal(count(b.result), '1');
    assert.equal(calls.length, 1, 'no request before the responses');
    assert.equal(a.queued + b.queued, 1, 'one read queued for the two requests');
    await a.drain();
    await b.drain();
    assert.equal(calls.length, 2, 'one read, after the response');
    const next = await request(cache, () => read('pokt1a'));
    assert.equal(count(next.result), '2');
    assert.equal(next.queued, 0);
  }));

test('a failed read after the response keeps the last good answer', () =>
  withCache(async (cache) => {
    const calls = countingIndexer();
    await (await request(cache, () => read('pokt1b'))).drain();
    cache.advance(65);
    globalThis.fetch = async () => new Response(JSON.stringify({ data: null, errors: [{ message: 'statement timeout' }] }), { status: 200 });
    const stale = await request(cache, () => read('pokt1b'));
    await stale.drain();
    const again = await request(cache, () => read('pokt1b'));
    assert.equal(count(again.result), '1', 'still the last good answer');
    assert.equal(calls.length, 1);
  }));

test('outside a request (no after()), a stale answer is read again before answering', () =>
  withCache(async (cache) => {
    const calls = countingIndexer();
    globalThis.__incrementalCache = cache;
    try {
      assert.equal(count(await read('pokt1c')), '1');
      cache.advance(65);
      assert.equal(count(await read('pokt1c')), '2');
      assert.equal(calls.length, 2);
    } finally {
      delete globalThis.__incrementalCache;
    }
  }));

const ERROR = { data: null, errors: [{ message: 'canceling statement due to statement timeout' }] };
const failing = (calls) => {
  globalThis.fetch = async (url, init) => {
    calls.push(JSON.parse(init.body));
    return new Response(JSON.stringify(ERROR), { status: 200, headers: { 'content-type': 'application/json' } });
  };
};

test('a failed read is held 15 s: requests get the last good answer with no read, then one read again', () =>
  withCache(async (cache) => {
    const calls = countingIndexer();
    await (await request(cache, () => read('pokt1d'))).drain();
    cache.advance(65);
    failing(calls);
    const stale = await request(cache, () => read('pokt1d'));
    await stale.drain();
    assert.equal(calls.length, 2, 'the read after the response failed');
    for (let i = 0; i < 4; i++) {
      const r = await request(cache, () => read('pokt1d'));
      assert.equal(count(r.result), '1', 'the last good answer');
      assert.equal(r.queued, 0, 'no read while the failure is held');
    }
    assert.equal(calls.length, 2);
    cache.advance(16);
    const later = await request(cache, () => read('pokt1d'));
    assert.equal(later.queued, 1, 'the hold ended: read again after the response');
    await later.drain();
    assert.equal(calls.length, 3);
  }));

test('with nothing cached, a held failure is thrown with no request until the hold ends', () =>
  withCache(async (cache) => {
    const calls = [];
    failing(calls);
    await assert.rejects(request(cache, () => read('pokt1e')), /statement timeout/);
    await assert.rejects(request(cache, () => read('pokt1e')), (e) => e.name === 'DataError' && /statement timeout/.test(e.message));
    assert.equal(calls.length, 1);
    cache.advance(16);
    await assert.rejects(request(cache, () => read('pokt1e')), /statement timeout/);
    assert.equal(calls.length, 2);
  }));

test('an aborted read holds nothing: the next read asks the indexer', () =>
  withCache(async (cache) => {
    const calls = countingIndexer();
    const ac = new AbortController();
    ac.abort();
    globalThis.fetch = async (url, init) => {
      calls.push(1);
      if (init.signal?.aborted) throw new DOMException('aborted', 'AbortError');
      return new Response(JSON.stringify(answer(calls.length)), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    await assert.rejects(request(cache, () => gqlFetch('main', Q, { o: ['pokt1f'] }, { revalidate: 60, signal: ac.signal })));
    const ok = await request(cache, () => read('pokt1f'));
    assert.equal(count(ok.result), '2');
    assert.equal(calls.length, 2);
  }));

// review of d5945e5
function slowCountingIndexer(ms) {
  const calls = [];
  globalThis.fetch = (url, init) =>
    new Promise((resolve) => {
      calls.push(JSON.parse(init.body));
      const n = calls.length;
      setTimeout(() => resolve(new Response(JSON.stringify(answer(n)), { status: 200, headers: { 'content-type': 'application/json' } })), ms);
    });
  return calls;
}

test('#1 a request that comes while the read after a response is still running does not read again', () =>
  withCache(async (cache) => {
    await (await request(cache, () => read('pokt1g'))).drain();
    const calls = slowCountingIndexer(50);
    cache.advance(65);
    const a = await request(cache, () => read('pokt1g'));
    const draining = a.drain();
    await new Promise((r) => setTimeout(r, 10)); // a's read is on its way
    const b = await request(cache, () => read('pokt1g'));
    await Promise.all([draining, b.drain()]);
    assert.equal(calls.length, 1, 'one read for both requests');
  }));

test('#2 an answer read more than two revalidates ago is read again before answering', () =>
  withCache(async (cache) => {
    const calls = countingIndexer();
    await (await request(cache, () => read('pokt1h'))).drain();
    cache.advance(3 * 60);
    const r = await request(cache, () => read('pokt1h'));
    assert.equal(count(r.result), '2', 'a fresh answer, not the one from three revalidates ago');
    await r.drain();
    assert.equal(calls.length, 2, 'and no second read after the response');
  }));

const PARTIAL_Q = 'query p($o: [String]) { getSupplierFleetList(owners: $o, bySupplier: false) { supplierCount } extra: x { y } }';
test('#5 while a partial answer is held, a request with a cached complete answer gets the cached answer', () =>
  withCache(async (cache) => {
    let mode = 'full';
    globalThis.fetch = async () => {
      const body = mode === 'full'
        ? { data: { getSupplierFleetList: [{ supplierCount: '1' }], extra: { y: 1 } } }
        : { data: { getSupplierFleetList: [{ supplierCount: '2' }], extra: null }, errors: [{ message: 'boom', path: ['extra'] }] };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const p = () => gqlFetch('main', PARTIAL_Q, { o: ['pokt1i'] }, { revalidate: 60, partial: ['extra'] });
    await (await request(cache, p)).drain();
    cache.advance(65);
    mode = 'partial';
    const stale = await request(cache, p);
    await stale.drain(); // the read after the response answers partial: held
    const r = await request(cache, p);
    assert.deepEqual(r.result.extra, { y: 1 }, 'the cached complete answer, not the held partial one');
  }));
