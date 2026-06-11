import test from 'node:test';
import assert from 'node:assert/strict';

import { buildQuotaHealthStatus } from '../src/core/quota-health.js';

function createDashboard(overrides = {}) {
  return {
    refreshedAt: '2026-06-12T07:42:00.000Z',
    refreshStatus: {
      phase: 'success',
      dataSource: 'wham_usage',
      freshness: 'fresh',
      lastAttemptAt: '2026-06-12T07:42:00.000Z',
      lastSuccessAt: '2026-06-12T07:42:00.000Z',
      lastFailureAt: null,
      nextScheduledRefreshAt: '2026-06-12T07:47:00.000Z',
      failureReason: null,
      lastRefreshReason: 'wake',
      lastErrorCode: null,
      lastErrorMessage: null,
      isRetryingAfterWake: false,
      retryAttempt: null
    },
    source: {
      origin: 'wham_usage'
    },
    summary: {
      remainingPercent: 72
    },
    weeklySummary: {
      remainingPercent: 84
    },
    ...overrides
  };
}

test('quota health is healthy when realtime data is fresh', () => {
  const health = buildQuotaHealthStatus(createDashboard(), {
    now: new Date('2026-06-12T07:46:00.000Z')
  });

  assert.equal(health.level, 'healthy');
  assert.equal(health.source, 'wham_usage');
  assert.equal(health.message, '数据正常 · 实时数据');
  assert.equal(health.isFallback, false);
});

test('quota health is delayed when data age exceeds 10 minutes', () => {
  const health = buildQuotaHealthStatus(createDashboard({
    refreshStatus: {
      phase: 'success',
      dataSource: 'wham_usage',
      freshness: 'recent',
      lastAttemptAt: '2026-06-12T07:20:00.000Z',
      lastSuccessAt: '2026-06-12T07:20:00.000Z',
      lastFailureAt: null,
      nextScheduledRefreshAt: '2026-06-12T07:47:00.000Z',
      failureReason: null,
      lastRefreshReason: 'auto',
      lastErrorCode: null,
      lastErrorMessage: null,
      isRetryingAfterWake: false,
      retryAttempt: null
    }
  }), {
    now: new Date('2026-06-12T07:31:30.000Z')
  });

  assert.equal(health.level, 'delayed');
  assert.equal(health.message, '数据可能延迟 · 建议手动刷新');
});

test('quota health is stale when data age exceeds 30 minutes', () => {
  const health = buildQuotaHealthStatus(createDashboard({
    refreshStatus: {
      phase: 'success',
      dataSource: 'wham_usage',
      freshness: 'stale',
      lastAttemptAt: '2026-06-12T06:50:00.000Z',
      lastSuccessAt: '2026-06-12T06:50:00.000Z',
      lastFailureAt: null,
      nextScheduledRefreshAt: '2026-06-12T07:47:00.000Z',
      failureReason: null,
      lastRefreshReason: 'auto',
      lastErrorCode: null,
      lastErrorMessage: null,
      isRetryingAfterWake: false,
      retryAttempt: null
    }
  }), {
    now: new Date('2026-06-12T07:31:30.000Z')
  });

  assert.equal(health.level, 'stale');
  assert.equal(health.isStale, true);
  assert.equal(health.message, '数据已过期 · 请立即刷新');
});

test('quota health is fallback when snapshot fallback is used', () => {
  const health = buildQuotaHealthStatus(createDashboard({
    refreshStatus: {
      phase: 'using_snapshot',
      dataSource: 'local_snapshot',
      freshness: 'recent',
      lastAttemptAt: '2026-06-12T07:30:00.000Z',
      lastSuccessAt: '2026-06-12T07:12:00.000Z',
      lastFailureAt: '2026-06-12T07:30:00.000Z',
      nextScheduledRefreshAt: '2026-06-12T07:47:00.000Z',
      failureReason: 'live source failed',
      lastRefreshReason: 'auto',
      lastErrorCode: 'timeout',
      lastErrorMessage: 'live source timed out',
      isRetryingAfterWake: false,
      retryAttempt: null
    },
    source: {
      origin: 'local_snapshot'
    }
  }), {
    now: new Date('2026-06-12T07:31:30.000Z')
  });

  assert.equal(health.level, 'fallback');
  assert.equal(health.source, 'snapshot_fallback');
  assert.equal(health.isFallback, true);
  assert.equal(health.message, '正在使用本地缓存 · 实时数据源不可用');
});

test('quota health is error when no usable data exists', () => {
  const health = buildQuotaHealthStatus({
    refreshedAt: '2026-06-12T07:42:00.000Z',
    refreshStatus: {
      phase: 'failed',
      dataSource: 'unknown',
      freshness: 'unknown',
      lastAttemptAt: '2026-06-12T07:42:00.000Z',
      lastSuccessAt: null,
      lastFailureAt: '2026-06-12T07:42:00.000Z',
      nextScheduledRefreshAt: '2026-06-12T07:47:00.000Z',
      failureReason: 'auth failed',
      lastRefreshReason: 'manual',
      lastErrorCode: 'auth',
      lastErrorMessage: 'login required',
      isRetryingAfterWake: false,
      retryAttempt: null
    },
    source: {
      origin: 'unknown'
    },
    summary: null
  }, {
    now: new Date('2026-06-12T07:50:00.000Z')
  });

  assert.equal(health.level, 'error');
  assert.equal(health.message, '数据不可用 · 请检查 Codex 登录状态或网络');
});
