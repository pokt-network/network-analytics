// The legacy* fields in both shapes: the bare value (older indexers) and {range, data} (newer ones). The ranges are
// built as the indexer's _legacy_range_of builds them: requested_to and covered_to are INCLUSIVE (covered_to is the
// covered span's end minus 1 µs), gaps are half-open [the block before the gap + 1 µs, the block after it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScalar } from '../lib/data/_util.ts';
import { unwrapRange, notCovered, rangeNote, fillCoverage } from '../lib/data/coverage.ts';

// legacy_rewards_by_addresses_and_time(…, '2026-08-31', '2026-09-30'): history written from 09-01 12:00, the writer
// stopped at 09-20 08:20, a gap of heights between blocks at 09-05 23:59:30 and 09-07 00:00:10.
const legacy = {
  requested_from: '2026-08-31T00:00:00+00:00',
  requested_to: '2026-09-30T00:00:00+00:00',
  covered_from: '2026-09-01T12:00:00+00:00',
  covered_to: '2026-09-20T08:19:59.999999+00:00',
  gaps: [{ from: '2026-09-05T23:59:30.000001+00:00', to: '2026-09-07T00:00:10+00:00' }],
};
const full = {
  requested_from: '2026-09-01T00:00:00+00:00',
  requested_to: '2026-09-30T00:00:00+00:00',
  covered_from: '2026-09-01T00:00:00+00:00',
  covered_to: '2026-09-30T00:00:00+00:00',
  gaps: [],
};
const none = { ...legacy, covered_from: null, covered_to: null, gaps: [] };

test('old shape: the bare value, no range', () => {
  const rows = [{ date_truncated: '2026-09-01T00:00:00', total_amount: 201156529 }];
  assert.deepEqual(unwrapRange(rows, true), { data: rows, range: null });
  assert.deepEqual(unwrapRange(parseScalar('2895793403'), true), { data: 2895793403, range: null }); // BigFloat string
});

test('new shape: data and range, also double-encoded; end_inclusive defaults to the field, the indexer flag wins', () => {
  const v = { range: legacy, data: [{ date_truncated: '2026-09-01T00:00:00', total_amount: 201156529 }] };
  assert.deepEqual(unwrapRange(v, true), { data: v.data, range: { ...legacy, end_inclusive: true } });
  assert.deepEqual(unwrapRange(parseScalar(JSON.stringify(v)), true), { data: v.data, range: { ...legacy, end_inclusive: true } });
  assert.equal(unwrapRange({ range: legacy, data: [] }, false).range.end_inclusive, false);
  assert.equal(unwrapRange({ range: { ...legacy, end_inclusive: false }, data: 0 }, true).range.end_inclusive, false);
});

test('nothing covered: told by the null covered bounds, whatever data is', () => {
  assert.equal(notCovered(unwrapRange({ range: none, data: null }, true).range), true); // legacy_*
  assert.equal(notCovered(unwrapRange({ range: none, data: [] }, false).range), true); // get…Json
  assert.equal(notCovered(unwrapRange({ range: full, data: 0 }, true).range), false); // covered, no income
  assert.equal(notCovered(unwrapRange({ range: full, data: null }, true).range), false); // covered, empty date series
  assert.equal(notCovered(unwrapRange('2895793403', true).range), false); // old shape
  assert.equal(rangeNote(unwrapRange({ range: none, data: null }, true).range), 'No data indexed for this window');
});

const L = (r) => unwrapRange({ range: r, data: null }, true).range; // as a legacy field reads it
const C = (r) => unwrapRange({ range: r, data: [] }, false).range; // as a catalog *_json field reads it

test('rangeNote: late start, early end (inclusive for legacy, exclusive for the catalog) and the gaps inside', () => {
  assert.equal(rangeNote(L(legacy), 'day'), 'Data since 2026-09-01 until 2026-09-20; gaps: 2026-09-05 – 2026-09-07');
  assert.equal(rangeNote(L(full), 'day'), null);
  assert.equal(rangeNote(null, 'day'), null);
  // an inclusive end at midnight is that day; an exclusive one is the day before
  const behind = { ...full, covered_to: '2026-09-20T00:00:00+00:00' };
  assert.equal(rangeNote(L(behind), 'day'), 'Data until 2026-09-20');
  assert.equal(rangeNote(C(behind), 'day'), 'Data until 2026-09-19');
  // the indexer's normal lag behind now is not a note
  assert.equal(rangeNote(L({ ...full, covered_to: '2026-09-29T23:40:00+00:00' }), 'day'), null);
});

test('rangeNote: gaps clipped to the window and the covered span; the one before covered_from is not repeated', () => {
  const leading = { from: null, to: '2026-09-01T12:00:00+00:00' }; // the history job's gap: explains the late start
  const tail = { from: '2026-09-28T10:00:00.000001+00:00', to: null }; // unbounded, past the window
  assert.equal(rangeNote(L({ ...legacy, covered_to: full.requested_to, gaps: [leading] }), 'day'), 'Data since 2026-09-01');
  assert.equal(rangeNote(L({ ...full, gaps: [tail] }), 'day'), 'gaps: 2026-09-28 – 2026-09-30');
  assert.equal(rangeNote(L({ ...full, gaps: [{ from: null, to: '2026-09-02T06:00:00+00:00' }] }), 'day'), 'gaps: 2026-09-01 – 2026-09-02');
  assert.equal(rangeNote(L({ ...full, gaps: [{ from: '2026-10-02T00:00:00+00:00', to: null }] }), 'day'), null);
});

test('rangeNote: minutes (UTC) for an hourly chart or a window of 48 h or less', () => {
  const day = {
    requested_from: '2026-09-01T08:00:00+00:00',
    requested_to: '2026-09-02T08:00:00+00:00',
    covered_from: '2026-09-01T12:00:00+00:00',
    covered_to: '2026-09-02T08:00:00+00:00',
    gaps: [{ from: '2026-09-01T23:30:00.000001+00:00', to: '2026-09-02T00:00:00+00:00' }],
  };
  const want = 'Data since 2026-09-01 12:00 UTC; gaps: 2026-09-01 23:30 UTC – 2026-09-02 00:00 UTC';
  assert.equal(rangeNote(L(day), 'hour'), want);
  assert.equal(rangeNote(L(day)), want);
  assert.equal(rangeNote(L({ ...day, covered_from: 'not a time' }), 'hour'), 'Data since …; gaps: 2026-09-01 23:30 UTC – 2026-09-02 00:00 UTC');
});

test('fillCoverage: null where nothing is covered (before, after, a whole-bucket gap), 0 where covered and absent', () => {
  const r = {
    requested_from: '2026-08-28T00:00:00+00:00',
    requested_to: '2026-09-03T00:00:00+00:00',
    covered_from: '2026-08-30T12:00:00+00:00',
    covered_to: '2026-09-02T08:19:59.999999+00:00',
    gaps: [{ from: '2026-08-30T23:59:30.000001+00:00', to: '2026-09-01T00:00:10+00:00' }],
  };
  const rows = [
    { date: '2026-08-30T00:00:00.000Z', a: 1 },
    { date: '2026-09-01T00:00:00.000Z', a: 2, b: 3 },
  ];
  // c: a tracked address with no rows at all draws 0 where covered, not nothing
  const want = [
    { date: '2026-08-28T00:00:00.000Z', a: null, b: null, c: null },
    { date: '2026-08-29T00:00:00.000Z', a: null, b: null, c: null },
    { date: '2026-08-30T00:00:00.000Z', a: 1, b: 0, c: 0 }, // partly covered: from 12:00
    { date: '2026-08-31T00:00:00.000Z', a: null, b: null, c: null }, // inside the gap
    { date: '2026-09-01T00:00:00.000Z', a: 2, b: 3, c: 0 },
    { date: '2026-09-02T00:00:00.000Z', a: 0, b: 0, c: 0 },
    { date: '2026-09-03T00:00:00.000Z', a: null, b: null, c: null }, // after covered_to
  ];
  assert.deepEqual(fillCoverage(rows, ['a', 'b', 'c'], L(r), 'day'), want);
  // the same gap reported as two that touch: neither covers 08-31 alone, together they do
  const split = { ...r, gaps: [{ from: r.gaps[0].from, to: '2026-08-31T12:00:00+00:00' }, { from: '2026-08-31T12:00:00+00:00', to: r.gaps[0].to }] };
  assert.deepEqual(fillCoverage(rows, ['a', 'b', 'c'], L(split), 'day'), want);
  assert.equal(rangeNote(L(split), 'day'), rangeNote(L(r), 'day'));
  // a bucket left uncovered by a gap and the early end together is null, not 0
  const tail = {
    requested_from: '2026-09-01T00:00:00+00:00',
    requested_to: '2026-09-03T00:00:00+00:00',
    covered_from: '2026-09-01T00:00:00+00:00',
    covered_to: '2026-09-02T19:59:59.999999+00:00',
    gaps: [{ from: '2026-09-02T00:00:00.000001+00:00', to: '2026-09-02T20:00:00+00:00' }],
  };
  assert.deepEqual(fillCoverage([{ date: '2026-09-01T00:00:00.000Z', a: 1 }], ['a'], L(tail), 'day'), [
    { date: '2026-09-01T00:00:00.000Z', a: 1 },
    { date: '2026-09-02T00:00:00.000Z', a: null },
    { date: '2026-09-03T00:00:00.000Z', a: null },
  ]);
  // an older indexer, nothing covered, no rows: unchanged
  assert.deepEqual(fillCoverage(rows, ['a'], null, 'day'), rows);
  assert.deepEqual(fillCoverage(rows, ['a'], L(none), 'day'), rows);
  assert.deepEqual(fillCoverage([], ['a'], L(r), 'day'), []);
});
