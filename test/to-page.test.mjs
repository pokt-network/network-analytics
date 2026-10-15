// toPage: a supplier restaking is live in two versions for a few seconds; the page keeps one row per supplier and fails
// only on a strict inversion of the (stake desc, id) order the keyset relies on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toPage } from '../lib/data/suppliers-list.ts';

const row = (supplierId, stakeUpokt) => ({ supplierId, ownerId: 'pokt1owner', stakeUpokt, stakeStatus: 'Staked', serviceCount: '1' });

test('a duplicate adjacent row (same stake, same id) is dropped', () => {
  const p = toPage([row('a', '600'), row('b', '500'), row('b', '500'), row('c', '400')], 25, 3);
  assert.deepEqual(p.rows.map((r) => r.operator), ['a', 'b', 'c']);
  assert.equal(p.endCursor, '400:c');
});

test('a duplicate with another stake (a restake that changed it) keeps the first row only', () => {
  const p = toPage([row('a', '600'), row('b', '500'), row('c', '450'), row('b', '400')], 25, 3);
  assert.deepEqual(p.rows.map((r) => r.operator), ['a', 'b', 'c']);
});

test('a dropped duplicate does not end the walk: hasNextPage follows the rows read', () => {
  const p = toPage([row('a', '600'), row('a', '600'), row('b', '500')], 2, 3);
  assert.deepEqual(p.rows.map((r) => r.operator), ['a', 'b']);
  assert.equal(p.hasNextPage, true);
});

test('a strict inversion between two suppliers fails the page', () => {
  assert.throws(() => toPage([row('a', '500'), row('b', '600')], 25, 2), /out of the \(stake desc, id\) order/);
  assert.throws(() => toPage([row('b', '500'), row('a', '500')], 25, 2), /out of the \(stake desc, id\) order/);
});
