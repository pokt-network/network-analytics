// The legacy* fields in both shapes: the bare value (older indexers) and {range, data} (newer ones).
// Fixtures follow the indexer's documented examples (partial coverage, a gap, a range before coverage).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScalar, unwrapRange, rangeNote } from '../lib/data/_util.ts';

const partial = {
  requested_from: '2026-08-31T00:00:00+00:00',
  requested_to: '2026-09-03T00:00:00+00:00',
  covered_from: '2026-09-01T12:00:00+00:00',
  covered_to: '2026-09-02T08:20:00+00:00',
  gaps: [{ from: '2026-09-01T23:30:00+00:00', to: '2026-09-02T00:00:00+00:00' }],
};
const full = {
  requested_from: '2026-09-02T00:00:00+00:00',
  requested_to: '2026-09-03T00:00:00+00:00',
  covered_from: '2026-09-02T00:00:00+00:00',
  covered_to: '2026-09-03T00:00:00+00:00',
  gaps: [],
};

test('old shape: the bare value, no range', () => {
  const rows = [{ date_truncated: '2026-09-01T00:00:00', total_amount: 201156529 }];
  assert.deepEqual(unwrapRange(rows), { data: rows, range: null });
  assert.deepEqual(unwrapRange({ reimbursement: 0, inflation: 123 }), { data: { reimbursement: 0, inflation: 123 }, range: null });
});

test('old scalar: a BigFloat numeric string, read through parseScalar as the field is', () => {
  assert.deepEqual(unwrapRange(parseScalar('2895793403')), { data: 2895793403, range: null });
});

test('new shape: data and range, also when double-encoded as a JSON string', () => {
  const v = { range: partial, data: [{ date_truncated: '2026-09-01T00:00:00', total_amount: 201156529 }] };
  assert.deepEqual(unwrapRange(v), { data: v.data, range: partial });
  assert.deepEqual(unwrapRange(parseScalar(JSON.stringify(v))), { data: v.data, range: partial });
  assert.deepEqual(unwrapRange({ range: partial, data: 201156529 }), { data: 201156529, range: partial });
});

test('new shape, nothing covered: data stays null, never 0', () => {
  const before = { ...partial, requested_to: '2026-09-01T00:00:00+00:00', covered_to: '2026-09-01T00:00:00+00:00', gaps: [] };
  assert.deepEqual(unwrapRange({ range: before, data: null }), { data: null, range: before });
});

test('rangeNote: the covered start and the gaps, only when less than asked was covered', () => {
  assert.equal(rangeNote(partial), 'Data since 2026-09-01; gaps: 2026-09-01 – 2026-09-02');
  assert.equal(rangeNote({ ...partial, gaps: [] }), 'Data since 2026-09-01');
  assert.equal(rangeNote({ ...full, gaps: [{ from: '2026-09-02T01:00:00+00:00', to: '2026-09-02T02:00:00+00:00' }] }), 'gaps: 2026-09-02');
  assert.equal(rangeNote(full), null);
  assert.equal(rangeNote(null), null);
});
