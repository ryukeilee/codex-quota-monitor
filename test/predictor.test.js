import test from 'node:test';
import assert from 'node:assert/strict';

import { predictFlow } from '../src/predictor/flow-predictor.js';

test('predictFlow estimates remaining development time and warns before hitting the wall', () => {
  const result = predictFlow({
    summary: {
      remaining: 20,
      remainingPercent: 20
    },
    records: [
      { at: '2026-06-06T08:00:00.000Z', amount: 10, model: 'gpt-5.4', intensity: 'medium' },
      { at: '2026-06-06T08:30:00.000Z', amount: 8, model: 'gpt-5.4', intensity: 'high' },
      { at: '2026-06-06T09:00:00.000Z', amount: 12, model: 'gpt-5.4', intensity: 'high' },
      { at: '2026-06-06T09:30:00.000Z', amount: 10, model: 'gpt-5.4', intensity: 'high' }
    ],
    now: new Date('2026-06-06T10:00:00.000Z')
  });

  assert.equal(result.hoursRemaining, 1);
  assert.equal(result.willHitWall, true);
  assert.equal(result.recommendedIntensity, 'low');
  assert.match(result.recommendation, /降低推理强度/);
});

test('predictFlow recommends keeping the current pace when burn is moderate', () => {
  const result = predictFlow({
    summary: {
      remaining: 65,
      remainingPercent: 65
    },
    records: [
      { at: '2026-06-06T08:00:00.000Z', amount: 6, model: 'gpt-5.4', intensity: 'medium' },
      { at: '2026-06-06T09:00:00.000Z', amount: 8, model: 'gpt-5.4', intensity: 'medium' }
    ],
    now: new Date('2026-06-06T10:00:00.000Z')
  });

  assert.equal(result.willHitWall, false);
  assert.equal(result.recommendedIntensity, 'current');
  assert.match(result.recommendation, /保持当前节奏/);
});
