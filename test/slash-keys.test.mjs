// The slashing route's cache keys carry the window's 60 s bucket: two windows are two entries, so a stale entry is
// never served for an old window after a quiet stretch; within one bucket the keys (and the window read) are the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slashCacheKeys } from '../lib/data/operator.ts';

const OPS = ['pokt1fgkqh3gp50u98p373263rxh34z8659cwqm3mpm'];
const page = { after: null, pageSize: 25, lookahead: true };
const t0 = Date.parse('2026-10-15T12:00:10Z');

test('two windows give two different keys, for the page and for the totals', () => {
  const a = slashCacheKeys(OPS, '60d', page, t0);
  const b = slashCacheKeys(OPS, '60d', page, t0 + 60_000);
  assert.notDeepEqual(a.page, b.page);
  assert.notDeepEqual(a.totals, b.totals);
  assert.equal(b.now - a.now, 60_000);
});

test('one 60 s bucket gives the same keys and the same window end', () => {
  const a = slashCacheKeys(OPS, '60d', page, t0);
  const b = slashCacheKeys(OPS, '60d', page, t0 + 30_000);
  assert.deepEqual(a, b);
  assert.equal(new Date(a.now).toISOString(), '2026-10-15T12:00:00.000Z');
});
