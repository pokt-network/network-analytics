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
