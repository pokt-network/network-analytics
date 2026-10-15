// Range-keyed caches carry the TTL-long bucket: a new bucket is a new key, so a stale entry is never served for a window
// older than one TTL; within a bucket the key stays (one build per TTL, as before).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rangeCacheKey, windowBucketStart } from '../lib/cache-keys.ts';

const t = Date.parse('2026-10-15T12:07:10Z');

test('one key per TTL-long bucket, aligned to the epoch', () => {
  assert.equal(new Date(windowBucketStart(1800, t)).toISOString(), '2026-10-15T12:00:00.000Z');
  assert.equal(new Date(windowBucketStart(600, t)).toISOString(), '2026-10-15T12:00:00.000Z');
  assert.equal(new Date(windowBucketStart(60, t)).toISOString(), '2026-10-15T12:07:00.000Z');
  assert.deepEqual(rangeCacheKey(['traffic'], '30d', 1800, t).key, rangeCacheKey(['traffic'], '30d', 1800, t + 20 * 60_000).key);
  assert.notDeepEqual(rangeCacheKey(['traffic'], '30d', 1800, t).key, rangeCacheKey(['traffic'], '30d', 1800, t + 30 * 60_000).key);
});

test('after a quiet stretch the key has moved: an old entry is not the answer', () => {
  const before = rangeCacheKey(['network'], '24h', 600, t);
  const later = rangeCacheKey(['network'], '24h', 600, t + 3 * 3_600_000);
  assert.notDeepEqual(before.key, later.key);
  assert.equal(later.now - before.now, 3 * 3_600_000);
});

test('ranges are different keys', () => {
  assert.notDeepEqual(rangeCacheKey(['traffic'], '7d', 1800, t).key, rangeCacheKey(['traffic'], '30d', 1800, t).key);
});
