// The legacy* fields in both shapes: the bare value (older indexers) and {range, data} (newer ones).
// Fixtures follow the indexer's documented examples (partial coverage, a gap, nothing covered); gaps and the covered
// end are half-open like the range, as the indexer's _coverage builds them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScalar, unwrapRange, notCovered, rangeNote } from '../lib/data/_util.ts';

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

test('new shape, nothing covered: told by the null covered bounds, whatever data is', () => {
  const none = { ...partial, covered_from: null, covered_to: null, gaps: [] };
  assert.deepEqual(unwrapRange({ range: none, data: null }), { data: null, range: none }); // legacy_*
  assert.deepEqual(unwrapRange({ range: none, data: [] }), { data: [], range: none }); // get…Json
  assert.equal(notCovered(none), true);
  // covered, with no income: 0 (or a null date series) is data, not "not covered"
  assert.equal(notCovered(unwrapRange({ range: full, data: 0 }).range), false);
  assert.equal(notCovered(unwrapRange({ range: full, data: null }).range), false);
  assert.equal(notCovered(unwrapRange('2895793403').range), false); // old shape
});

test('rangeNote: a late start, an early end and the gaps (half-open), only when less than asked was covered', () => {
  // the example: history from 09-01 12:00, indexer head at 09-02 08:20, a half-hour gap
  assert.equal(rangeNote(partial), 'Data since 2026-09-01 until 2026-09-02; gaps: 2026-09-01');
  assert.equal(rangeNote({ ...partial, covered_to: partial.requested_to, gaps: [] }), 'Data since 2026-09-01');
  assert.equal(rangeNote({ ...full, gaps: [{ from: '2026-09-02T01:00:00+00:00', to: '2026-09-02T02:00:00+00:00' }] }), 'gaps: 2026-09-02');
  assert.equal(rangeNote({ ...full, gaps: [{ from: '2026-09-01T23:00:00+00:00', to: '2026-09-02T00:00:01+00:00' }] }), 'gaps: 2026-09-01 – 2026-09-02');
  assert.equal(rangeNote({ ...full, gaps: [{ from: null, to: '2026-09-02T05:00:00+00:00' }] }), 'gaps: … – 2026-09-02');
  // a writer behind: the covered end is hours short of the window's end
  assert.equal(rangeNote({ ...full, covered_to: '2026-09-02T12:00:00+00:00' }), 'Data until 2026-09-02');
  assert.equal(rangeNote({ ...partial, covered_to: '2026-09-02T00:00:00+00:00', gaps: [] }), 'Data since 2026-09-01 until 2026-09-01');
  // the indexer's normal lag behind now is not a note
  assert.equal(rangeNote({ ...full, covered_to: '2026-09-02T23:59:00+00:00' }), null);
  assert.equal(rangeNote({ ...full, covered_from: null, covered_to: null }), 'No data indexed for this window yet');
  assert.equal(rangeNote({ ...full, covered_from: 'infinity' }), 'Data since …');
  assert.equal(rangeNote(full), null);
  assert.equal(rangeNote(null), null);
});
