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
