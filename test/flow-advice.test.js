import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFlowAdvice } from '../src/predictor/flow-advice.js';

function buildAdvice(overrides = {}) {
  return buildFlowAdvice({
    weeklyRemainingPercent: 80,
    windowRemainingPercent: 70,
    refreshStatus: {
      phase: 'success',
      dataSource: 'codex_app_server',
      freshness: 'fresh',
      lastSuccessAt: '2026-06-06T10:00:00.000Z'
    },
    quotaHealth: {
      level: 'healthy'
    },
    quotaBurnRate: {
      level: 'steady'
    },
    now: '2026-06-06T10:05:00.000Z',
    sourceOrigin: 'codex_app_server',
    ...overrides
  });
}

test('buildFlowAdvice asks to refresh first when data is stale', () => {
  const advice = buildAdvice({
    refreshStatus: {
      phase: 'success',
      dataSource: 'codex_app_server',
      freshness: 'stale',
      lastSuccessAt: '2026-06-06T09:50:00.000Z'
    },
    quotaHealth: {
      level: 'stale'
    },
    now: '2026-06-06T10:05:00.000Z'
  });

  assert.equal(advice.level, 'unknown');
  assert.equal(advice.title, '先刷新数据');
  assert.equal(advice.message, '再判断额度');
  assert.equal(advice.action, 'refresh_first');
  assert.equal(advice.basedOnStaleData, true);
});

test('buildFlowAdvice asks to refresh first when refresh failed', () => {
  const advice = buildAdvice({
    refreshStatus: {
      phase: 'failed',
      dataSource: 'unknown',
      freshness: 'unknown'
    },
    quotaHealth: {
      level: 'error'
    }
  });

  assert.equal(advice.title, '先刷新数据');
  assert.equal(advice.message, '再判断额度');
  assert.equal(advice.action, 'refresh_first');
});

test('buildFlowAdvice pauses high-intensity work when the 5-hour quota is at or below 15%', () => {
  const advice = buildAdvice({
    windowRemainingPercent: 15
  });

  assert.equal(advice.level, 'critical');
  assert.equal(advice.title, '暂停高强度开发');
  assert.equal(advice.message, '等窗口恢复');
  assert.equal(advice.action, 'wait_recovery');
});

test('buildFlowAdvice allows only small fixes when the 5-hour quota is at or below 30%', () => {
  const advice = buildAdvice({
    windowRemainingPercent: 30
  });

  assert.equal(advice.level, 'warning');
  assert.equal(advice.title, '只做小修');
  assert.equal(advice.message, '避免大重构');
  assert.equal(advice.action, 'small_fixes_only');
});

test('buildFlowAdvice preserves weekly quota when weekly quota is at or below 25%', () => {
  const advice = buildAdvice({
    weeklyRemainingPercent: 25,
    windowRemainingPercent: 80
  });

  assert.equal(advice.level, 'warning');
  assert.equal(advice.title, '降低强度');
  assert.equal(advice.message, '保留周额度');
  assert.equal(advice.action, 'slow_down');
});

test('buildFlowAdvice slows down when burn rate is high or critical', () => {
  const highAdvice = buildAdvice({
    quotaBurnRate: {
      level: 'high'
    }
  });
  const criticalAdvice = buildAdvice({
    quotaBurnRate: {
      level: 'critical'
    }
  });

  assert.equal(highAdvice.title, '放慢节奏');
  assert.equal(highAdvice.message, '拆小任务执行');
  assert.equal(highAdvice.action, 'slow_down');
  assert.equal(criticalAdvice.title, '放慢节奏');
  assert.equal(criticalAdvice.message, '拆小任务执行');
});

test('buildFlowAdvice keeps current pace when quotas are healthy', () => {
  const advice = buildAdvice({
    weeklyRemainingPercent: 88,
    windowRemainingPercent: 76
  });

  assert.equal(advice.level, 'healthy');
  assert.equal(advice.title, '继续开发');
  assert.equal(advice.message, '保持当前节奏');
  assert.equal(advice.action, 'keep');
});

test('buildFlowAdvice observes when required quota data is missing', () => {
  const advice = buildFlowAdvice({
    refreshStatus: {
      phase: 'success',
      dataSource: 'codex_app_server',
      freshness: 'fresh'
    },
    quotaHealth: {
      level: 'healthy'
    },
    quotaBurnRate: {
      level: 'unknown'
    },
    sourceOrigin: 'codex_app_server'
  });

  assert.equal(advice.level, 'unknown');
  assert.equal(advice.title, '先观察');
  assert.equal(advice.message, '等待有效数据');
  assert.equal(advice.action, 'refresh_first');
  assert.equal(advice.basedOnStaleData, false);
});
