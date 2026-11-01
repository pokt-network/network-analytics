// Review of 79d31e4..9e72877, server side: the reward reads never depend on the settlement read succeeding; a fresh process
// during a half-written settlement block does not replace a cached settlement with none; one response reads one
// settlement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextCache, request } from './next-request.mjs';

const S1 = { height: '966333', blockTime: '2026-10-15T21:19:37.95+00:00' };
const S2 = { height: '966353', blockTime: '2026-10-15T21:29:41.123456+00:00' };
const ADDR = 'pokt1ndn42rysxq4h7jfevf85hk82ggqy47auvdm03p';

// an indexer: the settlement read answers `chain()` (or fails), every other read records its variables and answers empty
function indexer(chain) {
  const reads = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    if (/query lastSettlement\b/.test(body.query)) {
      const c = chain();
      if (c === 'fail') return new Response(JSON.stringify({ data: null, errors: [{ message: 'statement timeout' }] }), { status: 200 });
      return new Response(JSON.stringify({ data: c }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    reads.push(body.variables);
    const field = body.query.match(/\{\s*(\w+)\s*\(/)?.[1] ?? 'x';
    return new Response(JSON.stringify({ data: { [field]: '{"range":null,"data":null}' } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return reads;
}

test('#1 a failed settlement read leaves the reward reads on the window ending now', async () => {
  const realFetch = globalThis.fetch;
  try {
    const { getRewardsWindow } = await import('../lib/data/owner.ts?r1');
    const reads = indexer(() => 'fail');
    await getRewardsWindow([ADDR], 24 * 3600);
    assert.equal(reads.length, 1, 'the reward read still went out');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('#4 a fresh process during a half-written settlement block keeps the cached settlement', async () => {
  const cache = nextCache();
  const realFetch = globalThis.fetch;
  try {
    let chain = { getLastSettlement: S1, _metadata: { lastProcessedHeight: 966340 } };
    indexer(() => chain);
    const a = await import('../lib/data/settlement.ts?r4a');
    await (await request(cache, () => a.getLastSettlement())).drain();
    cache.advance(65);
    chain = { getLastSettlement: S2, _metadata: { lastProcessedHeight: 966352 } }; // S2's block still being written
    const b = await import('../lib/data/settlement.ts?r4b'); // a new process: nothing in its memory
    const stale = await request(cache, () => b.getLastSettlement());
    assert.equal(stale.result?.height, 966333);
    await stale.drain().catch(() => {});
    const next = await request(cache, () => b.getLastSettlement());
    assert.equal(next.result?.height, 966333, 'still the cached settlement, not none');
  } finally {
    globalThis.fetch = realFetch;
    cache.restore();
  }
});

test('#6 the owner route reads one settlement for all its parts, even if a new one lands between reads', async () => {
  const cache = nextCache();
  const realFetch = globalThis.fetch;
  try {
    const reads = indexer(() => ({ getLastSettlement: S1, _metadata: { lastProcessedHeight: 966340 } }));
    const { getLastSettlement } = await import('../lib/data/settlement.ts');
    await (await request(cache, () => getLastSettlement())).drain();
    // the next reads of the settlement entry after the first see S2: another instance's write landing meanwhile
    const realGet = cache.get.bind(cache);
    let gets = 0;
    cache.get = async (key, ctx) => {
      const e = await realGet(key, ctx);
      if (e?.value?.data?.body?.includes('966333') && ++gets > 1) {
        const body = e.value.data.body.replace('966333', '966353').replace('2026-10-15T21:19:37.95+00:00', S2.blockTime);
        return { ...e, value: { ...e.value, data: { ...e.value.data, body } } };
      }
      return e;
    };
    const route = await import('../app/api/owner/route.ts');
    const { NextRequest } = await import('next/server');
    await request(cache, () => route.GET(new NextRequest(`http://na.test/api/owner?addresses=${ADDR}&range=7d`)));
    const ends = new Set(reads.map((v) => v.end?.slice(0, 19)));
    assert.equal(ends.size, 1, `one settlement for every part, got ${[...ends].join(', ')}`);
  } finally {
    globalThis.fetch = realFetch;
    cache.restore();
  }
});
