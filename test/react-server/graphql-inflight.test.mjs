// Identical cached reads in flight share one request: within one React render (pnf-explorer's rule), and outside a
// render, which is where every gqlFetch of this app runs (route handlers), through one map for the process. Needs React's
// server build (`--conditions=react-server`; `npm test` runs this directory apart, as the other tests load client hooks
// that need React's client build): its `cache` keeps one scope per render, emulated here as a React server does it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import * as React from 'react';

globalThis.AsyncLocalStorage = AsyncLocalStorage;
const internals = React.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
assert.ok(internals, 'run with --conditions=react-server: the client build of React has no render scope');
const renders = new AsyncLocalStorage();
internals.A = {
  getCacheForType(create) {
    const scope = renders.getStore();
    if (!scope) return create();
    if (!scope.has(create)) scope.set(create, create());
    return scope.get(create);
  },
  getOwner: () => null,
  cacheSignal: () => null,
};
const inRender = (fn) => renders.run(new Map(), fn);
const { gqlFetch } = await import('../../lib/graphql.ts');

const Q = 'query ownerTest($o: [String]) { getSupplierFleetList(owners: $o, bySupplier: false) { supplierCount } }';
const GOOD = { data: { getSupplierFleetList: [{ supplierCount: '1233' }] } };

function memoryCache() {
  const entries = new Map();
  return {
    isOnDemandRevalidate: false,
    entries,
    generateCacheKey: async (key) => key,
    get: async (key) => (entries.has(key) ? { value: entries.get(key), isStale: false } : null),
    set: async (key, value) => void entries.set(key, value),
  };
}

// An indexer that answers after `ms`, so that calls made together are in flight together.
function slowIndexer(ms) {
  const calls = [];
  globalThis.fetch = (url, init) =>
    new Promise((resolve) => {
      calls.push(JSON.parse(init.body));
      setTimeout(() => resolve(new Response(JSON.stringify(GOOD), { status: 200, headers: { 'content-type': 'application/json' } })), ms);
    });
  return calls;
}

async function withCache(fn) {
  const realFetch = globalThis.fetch;
  globalThis.__incrementalCache = memoryCache();
  try {
    await fn();
  } finally {
    globalThis.fetch = realFetch;
    delete globalThis.__incrementalCache;
  }
}

const read = (owner) => gqlFetch('main', Q, { o: [owner] }, { revalidate: 60 });

test('the emulated render scope behaves as React keeps it: one value per render, a new one outside', () => {
  const scoped = React.cache(() => ({}));
  assert.notEqual(scoped(), scoped(), 'outside a render');
  inRender(() => assert.equal(scoped(), scoped(), 'inside one render'));
});

test('outside a render (a route handler), identical reads in flight make one request', () =>
  withCache(async () => {
    const calls = slowIndexer(30);
    const results = await Promise.all([read('pokt1a'), read('pokt1a'), read('pokt1a')]);
    results.forEach((r) => assert.deepEqual(r, GOOD.data));
    assert.equal(calls.length, 1);
  }));

test('inside one render, identical reads in flight make one request', () =>
  withCache(() =>
    inRender(async () => {
      const calls = slowIndexer(30);
      await Promise.all([read('pokt1b'), read('pokt1b')]);
      assert.equal(calls.length, 1);
    }),
  ));

test('two renders do not share, nor does a render with a route handler', () =>
  withCache(async () => {
    const calls = slowIndexer(30);
    await Promise.all([inRender(() => read('pokt1c')), inRender(() => read('pokt1c')), read('pokt1c')]);
    assert.equal(calls.length, 3);
  }));
