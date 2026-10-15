// walkCheck: a supplier whose stake crosses the (stake, id) page boundary between two reads shows up twice or never;
// the supplier tables say so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { walkCheck } from '../lib/cursor-pages.ts';

test('a clean walk: no repeats, nothing missed', () => {
  assert.deepEqual(walkCheck([['a', 'b']], 2, ['c', 'd'], false, 4), { repeats: 0, missed: 0 });
});

test('a supplier slashed after page 1 shows again on page 2', () => {
  assert.deepEqual(walkCheck([['a', 'b']], 2, ['b', 'c'], true, 5), { repeats: 1, missed: 0 });
});

test('a supplier topped up before it was shown is missed: the last page says how many', () => {
  assert.deepEqual(walkCheck([['a', 'b']], 2, ['d'], false, 4), { repeats: 0, missed: 1 });
});

test('nothing is reported missed before the last page or without every earlier page', () => {
  assert.deepEqual(walkCheck([['a', 'b']], 2, ['d'], true, 4), { repeats: 0, missed: 0 });
  assert.deepEqual(walkCheck([], 2, ['d'], false, 4), { repeats: 0, missed: 0 });
});

test('a page missing in the record (a hole) is not counted as walked', () => {
  const shown = [];
  shown[1] = ['b'];
  assert.deepEqual(walkCheck(shown, 3, ['c'], false, 5), { repeats: 0, missed: 0 });
});

test('walkPages at the cap on a full page reads 1 row past the last cursor to know whether it is complete', async () => {
  const { walkPages } = await import('../lib/cursor-pages.ts');
  const realFetch = globalThis.fetch;
  const run = async (total) => {
    const urls = [];
    globalThis.fetch = async (url) => {
      urls.push(url);
      const after = Number(new URL(url, 'http://x').searchParams.get('after') ?? 0);
      const size = Number(new URL(url, 'http://x').searchParams.get('size'));
      const n = Math.max(0, Math.min(size, total - after));
      const rows = Array.from({ length: n }, (_, i) => after + i);
      return new Response(JSON.stringify({ rows, hasNextPage: n === size, endCursor: n ? String(after + n) : null }), { status: 200 });
    };
    const walk = await walkPages((after, size) => `/x?size=${size}${after ? `&after=${after}` : ''}`, 1000, 5000, 6, true);
    return { ...walk, calls: urls.length, read: walk.rows.length };
  };
  try {
    // exactly 5000: five full pages, then 1 row past them answers empty
    assert.deepEqual(await run(5000).then(({ complete, calls, read }) => ({ complete, calls, read })), { complete: true, calls: 6, read: 5000 });
    // more than the cap: the probe finds a row
    assert.deepEqual(await run(5001).then(({ complete, calls, read }) => ({ complete, calls, read })), { complete: false, calls: 6, read: 5000 });
    // under the cap, the short page ends it: no probe
    assert.deepEqual(await run(1434).then(({ complete, calls, read }) => ({ complete, calls, read })), { complete: true, calls: 2, read: 1434 });
  } finally {
    globalThis.fetch = realFetch;
  }
});
