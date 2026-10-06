// useTabData after a failed fetch: same url keeps its data next to the error, another url drops it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failedFetch } from '../lib/tab-data-state.ts';

const shown = { data: { rows: [1, 2, 3] }, dataUrl: '/api/traffic?range=7d', loading: true, error: null };

test('a failed retry of the same url keeps the data on screen, with the error', () => {
  assert.deepEqual(failedFetch(shown, '/api/traffic?range=7d', 'Request failed (502)'), {
    data: { rows: [1, 2, 3] },
    dataUrl: '/api/traffic?range=7d',
    loading: false,
    error: 'Request failed (502)',
  });
});

test('a failed fetch of another url drops the previous data', () => {
  assert.deepEqual(failedFetch(shown, '/api/traffic?range=30d', 'Request failed (502)'), {
    data: null,
    dataUrl: null,
    loading: false,
    error: 'Request failed (502)',
  });
});
