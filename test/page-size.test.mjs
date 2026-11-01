// A fractional pageSize on the supplier routes is read as a whole number: the row limit is a GraphQL Int.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextCache, request } from './next-request.mjs';

const { NextRequest } = await import('next/server');
const owner = await import('../app/api/owner/suppliers/route.ts');
const operator = await import('../app/api/operator/suppliers/route.ts');

const ADDR = 'pokt1ndn42rysxq4h7jfevf85hk82ggqy47auvdm03p';

for (const [name, mod] of [['owner', owner], ['operator', operator]]) {
  test(`${name} suppliers: pageSize=2.5 sends whole-number row limits`, async () => {
    const cache = nextCache();
    const realFetch = globalThis.fetch;
    const sent = [];
    globalThis.fetch = async (url, init) => {
      sent.push(JSON.parse(init.body).variables ?? {});
      return new Response(JSON.stringify({ data: null, errors: [{ message: 'stop' }] }), { status: 200 });
    };
    try {
      await request(cache, () => mod.GET(new NextRequest(`http://na.test/api/${name}/suppliers?addresses=${ADDR}&pageSize=2.5`))).catch(() => {});
      const limits = sent.flatMap((v) => Object.entries(v).filter(([k]) => /rowLimit|first/i.test(k)).map(([, x]) => x));
      assert.ok(limits.length > 0, 'a row limit was sent');
      for (const l of limits) assert.ok(Number.isInteger(l), `row limit ${l} is an Int`);
    } finally {
      globalThis.fetch = realFetch;
      cache.restore();
    }
  });
}
