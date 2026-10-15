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

test('an export that stops at the cap on a full page is complete when the count says so', async () => {
  const { exportIsComplete } = await import('../lib/cursor-pages.ts');
  // exactly 5000 slashes, read as 5 full pages of 1000: the walk cannot tell, the count can
  assert.equal(exportIsComplete(false, 5000, 5000, 5000), true);
  // more than the cap: capped
  assert.equal(exportIsComplete(false, 5000, 5000, 5001), false);
  // a count that is a floor ("at least") cannot vouch for it
  assert.equal(exportIsComplete(false, 5000, 5000, 5000, true), false);
  // a walk that ended on a short page is complete whatever the count
  assert.equal(exportIsComplete(true, 1446, 5000, 1450), true);
});
