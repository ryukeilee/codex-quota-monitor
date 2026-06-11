import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeQuotaBurnRate } from '../src/predictor/quota-burn-rate.js';

test('analyzeQuotaBurnRate returns unknown when snapshots are insufficient', () => {
  const result = analyzeQuotaBurnRate({
    snapshots: [
      {
        capturedAt: '2026-06-10T08:00:00.000Z',
        weeklyRemainingPercent: 82,
        window5hRemainingPercent: 76
      }
    ],
    now: new Date('2026-06-10T10:00:00.000Z')
  });

  assert.equal(result.level, 'unknown');
  assert.equal(result.recommendedIntensity, 'observe');
  assert.equal(result.estimatedTimeRemaining, null);
});

test('analyzeQuotaBurnRate flags fast burn and recommends lowering intensity', () => {
  const result = analyzeQuotaBurnRate({
    snapshots: [
      {
        capturedAt: '2026-06-10T08:00:00.000Z',
        weeklyRemainingPercent: 72,
        window5hRemainingPercent: 68
      },
      {
        capturedAt: '2026-06-10T09:00:00.000Z',
        weeklyRemainingPercent: 63,
        window5hRemainingPercent: 42
      },
      {
        capturedAt: '2026-06-10T10:00:00.000Z',
        weeklyRemainingPercent: 54,
        window5hRemainingPercent: 18
      }
    ],
    now: new Date('2026-06-10T10:00:00.000Z')
  });

  assert.equal(result.level, 'critical');
  assert.equal(result.isBurningFast, true);
  assert.equal(result.recommendedIntensity, 'lower');
  assert.match(result.message, /降模型或推理强度/);
});

test('analyzeQuotaBurnRate restarts the current window after a recovery jump', () => {
  const result = analyzeQuotaBurnRate({
    snapshots: [
      {
        capturedAt: '2026-06-10T06:00:00.000Z',
        weeklyRemainingPercent: 80,
        window5hRemainingPercent: 30
      },
      {
        capturedAt: '2026-06-10T07:00:00.000Z',
        weeklyRemainingPercent: 79,
        window5hRemainingPercent: 22
      },
      {
        capturedAt: '2026-06-10T08:00:00.000Z',
        weeklyRemainingPercent: 79,
        window5hRemainingPercent: 96
      },
      {
        capturedAt: '2026-06-10T09:00:00.000Z',
        weeklyRemainingPercent: 78,
        window5hRemainingPercent: 90
      },
      {
        capturedAt: '2026-06-10T10:00:00.000Z',
        weeklyRemainingPercent: 77,
        window5hRemainingPercent: 84
      }
    ],
    now: new Date('2026-06-10T10:00:00.000Z')
  });

  assert.equal(result.window5h.startPercent, 96);
  assert.equal(result.window5h.endPercent, 84);
  assert.ok(result.window5h.burnRatePerHour > 0);
});
