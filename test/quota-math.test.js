import test from 'node:test';
import assert from 'node:assert/strict';

import { summarizeUsage, getRefreshInterval, buildUsageTrendHistory } from '../src/core/quota-math.js';

test('summarizeUsage reports remaining quota and next recovery inside the 5-hour window', () => {
  const now = new Date('2026-06-06T10:00:00.000Z');
  const result = summarizeUsage({
    limit: 100,
    now,
    records: [
      { at: '2026-06-06T05:30:00.000Z', amount: 10 },
      { at: '2026-06-06T07:30:00.000Z', amount: 25 },
      { at: '2026-06-06T08:45:00.000Z', amount: 15 }
    ]
  });

  assert.equal(result.used, 50);
  assert.equal(result.remaining, 50);
  assert.equal(result.remainingPercent, 50);
  assert.equal(result.windowUsageCount, 3);
  assert.equal(result.windowState, 'healthy');
  assert.equal(result.nextRecoveryAt, '2026-06-06T10:30:00.000Z');
});

test('summarizeUsage marks the window as near limit when remaining quota is low', () => {
  const now = new Date('2026-06-06T10:00:00.000Z');
  const result = summarizeUsage({
    limit: 100,
    now,
    records: [
      { at: '2026-06-06T05:10:00.000Z', amount: 25 },
      { at: '2026-06-06T07:30:00.000Z', amount: 35 },
      { at: '2026-06-06T08:45:00.000Z', amount: 30 }
    ]
  });

  assert.equal(result.used, 90);
  assert.equal(result.remaining, 10);
  assert.equal(result.windowState, 'near_limit');
});

test('summarizeUsage supports a seven day rolling window', () => {
  const now = new Date('2026-06-06T10:00:00.000Z');
  const result = summarizeUsage({
    limit: 1000,
    now,
    windowMs: 7 * 24 * 60 * 60 * 1000,
    records: [
      { at: '2026-06-01T10:00:00.000Z', amount: 100 },
      { at: '2026-06-04T10:00:00.000Z', amount: 250 },
      { at: '2026-06-06T09:30:00.000Z', amount: 150 }
    ]
  });

  assert.equal(result.used, 500);
  assert.equal(result.remaining, 500);
  assert.equal(result.remainingPercent, 50);
  assert.equal(result.windowUsageCount, 3);
});

test('buildUsageTrendHistory reconstructs the 5-hour remaining quota from usage records', () => {
  const now = new Date('2026-06-06T10:00:00.000Z');
  const result = buildUsageTrendHistory({
    limit: 100,
    now,
    records: [
      { at: '2026-06-06T05:30:00.000Z', amount: 10 },
      { at: '2026-06-06T07:30:00.000Z', amount: 25 },
      { at: '2026-06-06T08:45:00.000Z', amount: 15 }
    ]
  });

  assert.equal(result.length, 4);
  assert.equal(result[0].remainingPercent, 100);
  assert.equal(result[1].remainingPercent, 90);
  assert.equal(result[2].remainingPercent, 65);
  assert.equal(result[3].remainingPercent, 50);
});

test('getRefreshInterval follows the low-frequency refresh policy', () => {
  assert.equal(getRefreshInterval({ isActive: false }), 5 * 60 * 1000);
  assert.equal(getRefreshInterval({ isActive: true, isHighIntensity: false, remainingPercent: 50 }), 5 * 60 * 1000);
  assert.equal(getRefreshInterval({ isActive: true, isHighIntensity: true, remainingPercent: 50 }), 30 * 1000);
  assert.equal(getRefreshInterval({ isActive: true, isHighIntensity: true, remainingPercent: 8 }), 15 * 1000);
});
