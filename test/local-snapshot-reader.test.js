import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeDemoSnapshot } from '../src/session/local-snapshot-reader.js';

test('normalizeDemoSnapshot shifts stale demo records into the recent 5-hour window', () => {
  const now = new Date('2026-06-06T10:00:00.000Z');
  const normalized = normalizeDemoSnapshot({
    sourceLabel: 'demo-local-snapshot',
    limit: 100,
    records: [
      { at: '2026-01-01T00:00:00.000Z', amount: 8, model: 'gpt-5.4', intensity: 'medium' },
      { at: '2026-01-01T01:00:00.000Z', amount: 12, model: 'gpt-5.4', intensity: 'high' }
    ]
  }, now);

  assert.equal(normalized.records.length, 2);
  assert.equal(normalized.records[0].at, '2026-06-06T07:00:00.000Z');
  assert.equal(normalized.records[1].at, '2026-06-06T08:30:00.000Z');
});
