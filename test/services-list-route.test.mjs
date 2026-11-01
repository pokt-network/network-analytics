// The services-list route's short-list fallbacks answer in the same shape as the cached success path: diagJson sends
// the picker { services, note } either way, and stamps the build time (x-built-at) on the fallback as on the success.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextCache, request } from './next-request.mjs';

const realFetch = globalThis.fetch;
// A first page that says more pages follow but gives no cursor: the walk reads short, twice (the retry).
const SHORT = { data: { _metadata: { lastProcessedHeight: 10 }, services: { totalCount: 2, pageInfo: { hasNextPage: true, endCursor: null }, nodes: [{ id: 'b', name: 'B' }] } } };

test('a short list answers { services, note } with the build stamp, on the first read and from the 60 s hold', async () => {
  const cache = nextCache();
  globalThis.fetch = async () => new Response(JSON.stringify(SHORT), { status: 200, headers: { 'content-type': 'application/json' } });
  const warn = console.warn;
  console.warn = () => {};
  try {
    const { GET } = await import('../app/api/services/list/route.ts');
    for (const [name, held] of [['first read', false], ['held read', true]]) {
      const r = await request(cache, () => GET());
      const body = await r.result.json();
      assert.deepEqual(body.services, [{ id: 'b', name: 'B' }], name);
      assert.match(body.note, /could not be read whole/, name);
      assert.equal(body.__diagBuiltAt, undefined, `${name}: no envelope in the body`);
      assert.ok(r.result.headers.get('x-built-at'), `${name}: stamped like the success path (held=${held})`);
    }
  } finally {
    console.warn = warn;
    globalThis.fetch = realFetch;
    cache.restore();
  }
});
