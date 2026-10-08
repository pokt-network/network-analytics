// The owner total in both shapes. A newer indexer sends {range, data} with data the upokt as a numeric STRING
// (as the old BigFloat was), so precision is not lost in a JSON double.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerTotal } from '../lib/data/owner.ts';

const range = {
  requested_from: '2026-08-31T00:00:00+00:00',
  requested_to: '2026-09-01T13:00:00+00:00',
  covered_from: '2026-09-01T12:00:00+00:00',
  covered_to: '2026-09-01T13:00:00+00:00',
  gaps: [],
};
const none = { ...range, covered_from: null, covered_to: null };
const withFlag = { ...range, end_inclusive: true };

test('old shape: the BigFloat string', () => {
  assert.deepEqual(ownerTotal('2895793403'), { totalPokt: 2895.793403, range: null });
});

test('new shape: data as a numeric string, as a number, and double-encoded', () => {
  assert.deepEqual(ownerTotal({ range, data: '201156529' }), { totalPokt: 201.156529, range: withFlag });
  assert.deepEqual(ownerTotal({ range, data: 201156529 }), { totalPokt: 201.156529, range: withFlag });
  assert.deepEqual(ownerTotal(JSON.stringify({ range, data: '201156529' })), { totalPokt: 201.156529, range: withFlag });
  assert.deepEqual(ownerTotal({ range, data: '0' }), { totalPokt: 0, range: withFlag }); // covered, no income
});

test('a dash, never 0: nothing covered, or a value that is not a number', () => {
  assert.equal(ownerTotal({ range: none, data: null }).totalPokt, null);
  assert.equal(ownerTotal({ range, data: 'abc' }).totalPokt, null);
  assert.equal(ownerTotal({ range, data: '' }).totalPokt, null);
  assert.equal(ownerTotal(null).totalPokt, null);
  // only a plain decimal is a number: no hex, no padding
  assert.equal(ownerTotal({ range, data: '0x10' }).totalPokt, null);
  assert.equal(ownerTotal({ range, data: ' 5 ' }).totalPokt, null);
});

test('above 2^53 the string still reads, rounded to the nearest double (exact only below 2^53)', () => {
  const t = ownerTotal({ range, data: '9007199254740993' }).totalPokt;
  assert.equal(t, 9007199254740992 / 1e6);
});
