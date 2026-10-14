// uncoveredSpans: each uncovered instant of the window once (a late start, the gaps clipped and merged, the end past
// covered_to), so a total that adds them to the covered part counts nothing twice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uncoveredSpans } from '../lib/data/coverage.ts';

const t = (iso) => Date.parse(iso);
const base = {
  requested_from: '2026-10-01T00:00:00Z',
  requested_to: '2026-10-02T00:00:00Z',
  covered_from: '2026-10-01T00:00:00Z',
  covered_to: '2026-10-02T00:00:00Z',
  gaps: [],
  end_inclusive: false,
};

test('fully covered: nothing uncovered', () => {
  assert.deepEqual(uncoveredSpans(base), []);
});

test('late start, lagging end', () => {
  const r = { ...base, covered_from: '2026-10-01T02:00:00Z', covered_to: '2026-10-01T23:00:00Z' };
  assert.deepEqual(uncoveredSpans(r), [
    [t('2026-10-01T00:00:00Z'), t('2026-10-01T02:00:00Z')],
    [t('2026-10-01T23:00:00Z'), t('2026-10-02T00:00:00Z')],
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
  assert.deepEqual(uncoveredSpans(r), [
    [t('2026-10-01T05:00:00Z'), t('2026-10-01T08:00:00Z')],
    [t('2026-10-01T19:00:00Z'), t('2026-10-01T20:00:00Z')],
    [t('2026-10-01T20:00:00Z'), t('2026-10-02T00:00:00Z')],
  ]);
});
