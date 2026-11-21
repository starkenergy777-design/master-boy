import assert from 'node:assert/strict';
import test from 'node:test';
import { coversTop15Term, TOP15_TERM_MS, unusedTimeRefundMinor } from './financial.js';

test('Top 15 needs listing coverage through its whole term', () => {
  const now = Date.now();
  assert.equal(coversTop15Term(new Date(now + TOP15_TERM_MS).toISOString(), now), true);
  assert.equal(coversTop15Term(new Date(now + TOP15_TERM_MS - 1000).toISOString(), now), false);
  assert.equal(coversTop15Term(null, now), false);
});

test('refund is bounded by paid amount and delivered time', () => {
  assert.equal(unusedTimeRefundMinor(10001, 0, 100, 0), 10001);
  assert.equal(unusedTimeRefundMinor(10001, 0, 100, 50), 5001);
  assert.equal(unusedTimeRefundMinor(10001, 0, 100, 100), 0);
  assert.equal(unusedTimeRefundMinor(10001, 0, 100, 200), 0);
  assert.throws(() => unusedTimeRefundMinor(-1, 0, 100, 50));
});
