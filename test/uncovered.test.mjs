// uncoveredSpansMicros: each uncovered instant of the window once (a late start, the gaps clipped and merged, the end
// past covered_to), in microseconds, so a total that adds them to the covered part counts nothing twice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uncoveredSpansMicros, toMicros, microsToIso } from '../lib/data/coverage.ts';

const u = (iso) => toMicros(iso);
const base = {
  requested_from: '2026-10-01T00:00:00Z',
  requested_to: '2026-10-02T00:00:00Z',
  covered_from: '2026-10-01T00:00:00Z',
  covered_to: '2026-10-02T00:00:00Z',
  gaps: [],
  end_inclusive: false,
};

test('fully covered: nothing uncovered', () => {
  assert.deepEqual(uncoveredSpansMicros(base), []);
});

test('late start, lagging end', () => {
  const r = { ...base, covered_from: '2026-10-01T02:00:00Z', covered_to: '2026-10-01T23:00:00Z' };
  assert.deepEqual(uncoveredSpansMicros(r), [
    [u('2026-10-01T00:00:00Z'), u('2026-10-01T02:00:00Z')],
    [u('2026-10-01T23:00:00Z'), u('2026-10-02T00:00:00Z')],
  ]);
});

test('overlapping gaps merge, a gap past the covered span is clipped to it', () => {
  const r = {
    ...base,
    covered_to: '2026-10-01T20:00:00Z',
    gaps: [
      { from: '2026-10-01T05:00:00Z', to: '2026-10-01T07:00:00Z' },
      { from: '2026-10-01T06:00:00Z', to: '2026-10-01T08:00:00Z' },
      { from: '2026-10-01T19:00:00Z', to: '2026-10-01T22:00:00Z' },
    ],
  };
  assert.deepEqual(uncoveredSpansMicros(r), [
    [u('2026-10-01T05:00:00Z'), u('2026-10-01T08:00:00Z')],
    [u('2026-10-01T19:00:00Z'), u('2026-10-01T20:00:00Z')],
    [u('2026-10-01T20:00:00Z'), u('2026-10-02T00:00:00Z')],
  ]);
});

test('the block that closes the covered span is covered: covered_to = its time + 1 µs', () => {
  // the indexer writes covered_to as the last covered block's time + 1 µs
  const r = { ...base, covered_to: '2026-10-01T23:00:00.123457+00:00' };
  const [[a, b]] = uncoveredSpansMicros(r);
  const lastCoveredBlock = u('2026-10-01T23:00:00.123456+00:00');
  const nextBlock = u('2026-10-01T23:00:00.123457+00:00');
  assert.ok(!(lastCoveredBlock >= a && lastCoveredBlock < b), 'the covered block is not in the uncovered span');
  assert.ok(nextBlock >= a && nextBlock < b, 'a block at covered_to is uncovered');
  // in milliseconds both are .123 and the covered block would land in the span, counted twice
  assert.equal(Date.parse('2026-10-01T23:00:00.123456Z'), Date.parse('2026-10-01T23:00:00.123457Z'));
});

test('microsecond timestamps round-trip', () => {
  assert.equal(microsToIso(u('2026-10-15T01:33:16.796001+00:00')), '2026-10-15T01:33:16.796001Z');
  assert.equal(u('2026-10-15T01:33:16Z'), u('2026-10-15T01:33:16.000000Z'));
});

test('toMicros reads a space separator, keeps an epoch number to the ms, and refuses a fraction it cannot place', () => {
  assert.equal(u('2026-10-01 23:00:00.123456+00:00'), u('2026-10-01T23:00:00.123456+00:00'));
  assert.equal(u('2026-10-01 23:00:00.123456+00:00') % 1000000n, 123456n);
  const ms = Date.parse('2026-10-01T23:00:00.123Z');
  assert.equal(u(ms), BigInt(ms) * 1000n);
  assert.equal(u(String(ms)), BigInt(ms) * 1000n);
  assert.equal(u('2026-10-01T23:00:00.123456+00:00') - u(ms), 456n);
  assert.equal(u('Oct 1, 2026 23:00:00.5 UTC'), null);
  assert.equal(u(null), null);
});
