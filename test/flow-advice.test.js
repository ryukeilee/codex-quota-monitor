import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFlowAdvice } from '../src/predictor/flow-advice.js';

test('buildFlowAdvice recommends larger work when both quotas are healthy and fresh', () => {
  const advice = buildFlowAdvice({
    weeklySummary: {
      remainingPercent: 88
    },
    summary: {
      remainingPercent: 76
    },
    refreshStatus: {
      phase: 'success',
      dataSource: 'codex_app_server',
      freshness: 'fresh'
    },
    sourceOrigin: 'codex_app_server'
  });

  assert.equal(advice.level, 'good');
  assert.equal(advice.title, '适合开大任务');
  assert.equal(advice.basedOnStaleData, false);
  assert.deepEqual(advice.recommendedWork, ['新功能', '重构', '长任务']);
});

test('buildFlowAdvice becomes conservative when the quota is mid-range or the data is stale', () => {
  const advice = buildFlowAdvice({
    weeklySummary: {
      remainingPercent: 52
    },
    summary: {
      remainingPercent: 68
    },
    refreshStatus: {
      phase: 'success',
      dataSource: 'local_snapshot',
      freshness: 'stale'
    },
    sourceOrigin: 'local_snapshot'
  });

  assert.equal(advice.level, 'careful');
  assert.equal(advice.title, '先控范围');
  assert.equal(advice.basedOnStaleData, true);
  assert.match(advice.message, /数据偏旧/);
});

test('buildFlowAdvice asks for review-only work when quota is very low', () => {
  const advice = buildFlowAdvice({
    weeklySummary: {
      remainingPercent: 12
    },
    summary: {
      remainingPercent: 15
    },
    refreshStatus: {
      phase: 'failed',
      dataSource: 'unknown',
      freshness: 'unknown'
    },
    sourceOrigin: 'unknown'
  });

  assert.equal(advice.level, 'review_only');
  assert.equal(advice.title, '只做 Review / 收尾');
  assert.equal(advice.basedOnStaleData, true);
  assert.deepEqual(advice.avoidWork, ['新功能', '大重构']);
});

test('buildFlowAdvice returns unknown when it has no quota data at all', () => {
  const advice = buildFlowAdvice({
    refreshStatus: {
      phase: 'failed',
      dataSource: 'unknown',
      freshness: 'unknown'
    },
    sourceOrigin: 'unknown'
  });

  assert.equal(advice.level, 'unknown');
  assert.equal(advice.title, '先等数据');
  assert.equal(advice.basedOnStaleData, true);
});
