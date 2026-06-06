import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeRateLimitsResponse } from '../src/session/codex-rate-limit-reader.js';

test('normalizeRateLimitsResponse maps app-server rate limits into percent summaries', () => {
  const result = normalizeRateLimitsResponse({
    rateLimits: {
      primary: {
        usedPercent: 10,
        windowDurationMins: 300,
        resetsAt: 1791234567
      },
      secondary: {
        usedPercent: 24,
        windowDurationMins: 10080,
        resetsAt: 1791235567
      },
      credits: { balance: 12.5 },
      planType: 'pro'
    }
  });

  assert.ok(result);
  assert.equal(result.sourceLabel, 'codex-account-rate-limits');
  assert.equal(result.primary.used, 10);
  assert.equal(result.primary.remainingPercent, 90);
  assert.equal(result.primary.presentation, 'percent');
  assert.equal(result.primary.windowState, 'healthy');
  assert.equal(result.primary.nextRecoveryAt, new Date(1791234567 * 1000).toISOString());
  assert.equal(result.secondary.used, 24);
  assert.equal(result.secondary.remainingPercent, 76);
  assert.equal(result.secondary.presentation, 'percent');
  assert.equal(result.secondary.nextRecoveryAt, new Date(1791235567 * 1000).toISOString());
  assert.equal(result.credits.balance, 12.5);
  assert.equal(result.planType, 'pro');
});
