// gqlFetch with `revalidate`: a 200 that carries `errors` (PostGraphile's answer to a RAISE or a statement timeout) is
// never served again, while a good answer is cached as before. Runs Next's own unstable_cache, with an in-memory
// incremental cache where a Next server keeps its own (unstable_cache reads globalThis.__incrementalCache outside a
// request).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';

// a Next server provides AsyncLocalStorage before its modules load; Next's work-unit storage needs it to run the callback
globalThis.AsyncLocalStorage = AsyncLocalStorage;
const { gqlFetch } = await import('../lib/graphql.ts');

function memoryCache() {
  const entries = new Map();
  return {
    isOnDemandRevalidate: false,
    entries,
    async generateCacheKey(key) {
      return key;
    },
    async get(key) {
      const value = entries.get(key);
      return value ? { value, isStale: false } : null;
    },
    async set(key, value) {
      entries.set(key, value);
    },
  };
}

function fakeIndexer(answers) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(JSON.parse(init.body));
    const body = answers[Math.min(calls.length - 1, answers.length - 1)];
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return calls;
}

const Q = 'query ownerTest($o: [String]) { getSupplierFleetList(owners: $o, bySupplier: false) { supplierCount } }';
const GOOD = { data: { getSupplierFleetList: [{ supplierCount: '1233' }] } };
const ERROR = { data: null, errors: [{ message: 'canceling statement due to statement timeout' }] };

test('a 200 with errors is not cached: it is held 15 s, then the indexer is asked again and its good answer is cached', async () => {
  const realFetch = globalThis.fetch;
  const realNow = Date.now;
  globalThis.__incrementalCache = memoryCache();
  const calls = fakeIndexer([ERROR, GOOD]);
  try {
    await assert.rejects(gqlFetch('main', Q, { o: ['pokt1a'] }, { revalidate: 1800 }), /statement timeout/);
    assert.equal(globalThis.__incrementalCache.entries.size, 0, 'the error was not stored');
    await assert.rejects(gqlFetch('main', Q, { o: ['pokt1a'] }, { revalidate: 1800 }), /statement timeout/);
    assert.equal(calls.length, 1, 'within 15 s the held error, with no request');
    Date.now = () => realNow() + 16_000;
    const second = await gqlFetch('main', Q, { o: ['pokt1a'] }, { revalidate: 1800 });
    assert.deepEqual(second, GOOD.data);
    assert.equal(calls.length, 2, 'the second call went to the indexer');
    const third = await gqlFetch('main', Q, { o: ['pokt1a'] }, { revalidate: 1800 });
    assert.deepEqual(third, GOOD.data);
    assert.equal(calls.length, 2, 'the third call was served from the cache: one request per miss, as before');
    // other variables are another entry
    await gqlFetch('main', Q, { o: ['pokt1b'] }, { revalidate: 1800 });
    assert.equal(calls.length, 3);
  } finally {
    Date.now = realNow;
    globalThis.fetch = realFetch;
    delete globalThis.__incrementalCache;
  }
});

test('no-store and calls with no cache option never touch the cache', async () => {
  const realFetch = globalThis.fetch;
  globalThis.__incrementalCache = memoryCache();
  const calls = fakeIndexer([GOOD]);
  try {
    await gqlFetch('main', Q, { o: ['pokt1a'] }, { cache: 'no-store' });
    await gqlFetch('main', Q, { o: ['pokt1a'] });
    assert.equal(calls.length, 2);
    assert.equal(globalThis.__incrementalCache.entries.size, 0);
  } finally {
    globalThis.fetch = realFetch;
    delete globalThis.__incrementalCache;
  }
});

test('outside a Next server (no incremental cache) a revalidate call still answers, uncached', async () => {
  const realFetch = globalThis.fetch;
  const calls = fakeIndexer([GOOD]);
  try {
    assert.deepEqual(await gqlFetch('main', Q, { o: ['pokt1a'] }, { revalidate: 60 }), GOOD.data);
    assert.deepEqual(await gqlFetch('main', Q, { o: ['pokt1a'] }, { revalidate: 60 }), GOOD.data);
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = realFetch;
  }
});
