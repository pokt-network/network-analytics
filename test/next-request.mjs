// A Next request, as far as unstable_cache and after() see one: Next's own IncrementalCache (its staleness rule
// included) over an in-memory store whose entries can be aged, and a work store whose after() queues the callbacks.
// `drain()` runs them the way Next does once the response is sent: callbacks first, then the revalidations they queued
// (after-context.js runs callbacks inside withExecuteRevalidates).
import { createRequire } from 'node:module';
import { AsyncLocalStorage } from 'node:async_hooks';

globalThis.AsyncLocalStorage = AsyncLocalStorage; // a Next server provides it before its modules load
const require = createRequire(import.meta.url);
const { IncrementalCache } = require('next/dist/server/lib/incremental-cache/index.js');
const { workAsyncStorage } = require('next/dist/server/app-render/work-async-storage.external.js');
const { workUnitAsyncStorage } = require('next/dist/server/app-render/work-unit-async-storage.external.js');

export function nextCache() {
  const entries = new Map();
  class AgingHandler {
    async get(key) {
      return entries.get(key) ?? null;
    }
    async set(key, value) {
      entries.set(key, { value, lastModified: performance.timeOrigin + performance.now() });
    }
  }
  const manifest = { version: 4, routes: {}, dynamicRoutes: {}, notFoundRoutes: [], preview: { previewModeId: 'test' } };
  const cache = new IncrementalCache({
    dev: false,
    minimalMode: false,
    requestHeaders: {},
    // Next up to 16.2 took getPrerenderManifest(); 16.4 takes the manifest itself and previewProps. Both are given,
    // so the harness runs on either.
    getPrerenderManifest: () => manifest,
    prerenderManifest: manifest,
    previewProps: manifest.preview,
    CurCacheHandler: AgingHandler,
  });
  const realNow = Date.now;
  let offset = 0;
  return Object.assign(cache, {
    entries,
    /** Ages every entry by `seconds` and moves Date.now as far. */
    advance(seconds) {
      offset += seconds * 1000;
      Date.now = () => realNow() + offset;
      for (const e of entries.values()) e.lastModified -= seconds * 1000;
    },
    restore() {
      Date.now = realNow;
    },
  });
}

/** Runs `fn` as one request against `cache`; returns its result and `drain`, which runs what it left for after. */
export async function request(cache, fn) {
  const callbacks = [];
  const store = {
    incrementalCache: cache,
    fetchCache: undefined,
    isOnDemandRevalidate: false,
    isDraftMode: false,
    isStaticGeneration: false,
    nextFetchId: 1,
    pendingRevalidates: {},
    afterContext: { after: (task) => callbacks.push(task) },
  };
  // Next 16.4's after() also needs the request's work-unit store (16.2 read the work store alone).
  const unit = { type: 'request', phase: 'action', url: { pathname: '/test', search: '' }, implicitTags: undefined };
  const inRequest = (f) => workAsyncStorage.run(store, () => workUnitAsyncStorage.run(unit, f));
  const result = await inRequest(fn);
  const queued = callbacks.length;
  const drain = () =>
    inRequest(async () => {
      const before = new Set(Object.values(store.pendingRevalidates));
      for (let i = 0; i < callbacks.length; i++) await callbacks[i]();
      await Promise.all(Object.values(store.pendingRevalidates).filter((p) => !before.has(p)));
    });
  return { result, queued, drain };
}
