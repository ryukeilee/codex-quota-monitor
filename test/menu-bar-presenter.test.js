import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMenuBarState,
  formatRefreshLabel
} from '../src/notification/menu-bar-presenter.js';

test('buildMenuBarState exposes percentage title and concise tray menu labels', () => {
  const state = buildMenuBarState({
    refreshedAt: '2026-06-06T10:12:00.000Z',
    refreshStatus: {
      phase: 'success',
      dataSource: 'codex_app_server',
      freshness: 'fresh',
      lastAttemptAt: '2026-06-06T10:12:00.000Z',
      lastSuccessAt: '2026-06-06T10:12:00.000Z',
      lastFailureAt: null,
      nextScheduledRefreshAt: '2026-06-06T10:17:00.000Z',
      failureReason: null,
      isRetryingAfterWake: false,
      retryAttempt: null
    },
    summary: {
      remainingPercent: 64,
      remaining: 64,
      used: 36,
      limit: 100,
      presentation: 'percent',
      windowState: 'healthy',
      nextRecoveryAt: '2026-06-06T10:30:00.000Z'
    },
    weeklySummary: {
      remainingPercent: 87,
      remaining: 87,
      used: 13,
      limit: 100,
      nextRecoveryAt: '2026-06-11T10:30:00.000Z'
    },
    prediction: {
      hoursRemaining: 5,
      burnRatePerHour: 7.2,
      recommendedIntensity: 'current',
      recommendation: '当前消耗速度平稳，建议保持当前节奏。'
    },
    flowAdvice: {
      level: 'light',
      title: '适合小步推进',
      message: '额度还行，先做小任务或拆分推进。',
      recommendedWork: ['小功能', '修 bug', '补测试'],
      avoidWork: ['大重构', '跨模块改动'],
      basedOnStaleData: false
    },
    preferences: {
      isActive: true,
      isHighIntensity: false,
      showPercentageInMenuBar: true
    }
  });

  assert.equal(state.title, '87%');
  assert.equal(state.toolTip, 'Codex Monitor：周 87% · 5小时 64% · 正常 · 最近成功');
  assert.equal(state.lines.overviewLabel, '周 87% · 5小时 64%');
  assert.equal(state.lines.statusLabel, '状态 正常 · 实时数据 · 新鲜');
  assert.equal(state.lines.adviceLabel, '建议 适合小步推进');
  assert.equal(state.lines.nextRefreshLabel, '下次刷新 18:17:00');
});

test('buildMenuBarState keeps the tray title as a plain percentage when quota is near limit', () => {
  const state = buildMenuBarState({
    refreshedAt: '2026-06-06T10:12:00.000Z',
    refreshStatus: {
      phase: 'success',
      dataSource: 'codex_app_server',
      freshness: 'fresh',
      lastAttemptAt: '2026-06-06T10:12:00.000Z',
      lastSuccessAt: '2026-06-06T10:12:00.000Z',
      lastFailureAt: null,
      nextScheduledRefreshAt: '2026-06-06T10:17:00.000Z',
      failureReason: null,
      isRetryingAfterWake: false,
      retryAttempt: null
    },
    summary: {
      remainingPercent: 12,
      remaining: 12,
      used: 88,
      limit: 100,
      presentation: 'percent',
      windowState: 'near_limit',
      nextRecoveryAt: null
    },
    weeklySummary: {
      remainingPercent: 87,
      remaining: 87,
      used: 13,
      limit: 100,
      nextRecoveryAt: '2026-06-11T10:30:00.000Z'
    },
    prediction: {
      hoursRemaining: 1,
      burnRatePerHour: 13.5,
      recommendedIntensity: 'low',
      recommendation: '建议降低推理强度，避免在当前窗口内撞到额度墙。'
    },
    flowAdvice: {
      level: 'review_only',
      title: '只做 Review / 收尾',
      message: '额度很紧，适合 Review、规划、收尾。',
      recommendedWork: ['Review', '规划', '收尾'],
      avoidWork: ['新功能', '大重构'],
      basedOnStaleData: false
    },
    preferences: {
      showPercentageInMenuBar: true
    },
    refreshInterval: 15000
  });

  assert.equal(state.title, '87%');
  assert.equal(state.lines.overviewLabel, '周 87% · 5小时 12%');
  assert.equal(state.lines.statusLabel, '状态 正常 · 实时数据 · 新鲜');
});

test('buildMenuBarState hides title text when menu bar display is disabled', () => {
  const state = buildMenuBarState({
    refreshedAt: '2026-06-06T10:12:00.000Z',
    refreshStatus: {
      phase: 'success',
      dataSource: 'codex_app_server',
      freshness: 'fresh',
      lastAttemptAt: '2026-06-06T10:12:00.000Z',
      lastSuccessAt: '2026-06-06T10:12:00.000Z',
      lastFailureAt: null,
      nextScheduledRefreshAt: '2026-06-06T10:17:00.000Z',
      failureReason: null,
      isRetryingAfterWake: false,
      retryAttempt: null
    },
    summary: {
      remainingPercent: 12,
      remaining: 12,
      used: 88,
      limit: 100,
      presentation: 'percent',
      windowState: 'near_limit',
      nextRecoveryAt: null
    },
    weeklySummary: {
      remainingPercent: 87,
      remaining: 87,
      used: 13,
      limit: 100,
      nextRecoveryAt: '2026-06-11T10:30:00.000Z'
    },
    prediction: {
      hoursRemaining: 1,
      burnRatePerHour: 13.5,
      recommendedIntensity: 'low',
      recommendation: '建议降低推理强度，避免在当前窗口内撞到额度墙。'
    },
    flowAdvice: {
      level: 'review_only',
      title: '只做 Review / 收尾',
      message: '额度很紧，适合 Review、规划、收尾。',
      recommendedWork: ['Review', '规划', '收尾'],
      avoidWork: ['新功能', '大重构'],
      basedOnStaleData: false
    },
    preferences: {
      showPercentageInMenuBar: false
    }
  });

  assert.equal(state.title, '');
  assert.equal(state.lines.overviewLabel, '周 87% · 5小时 12%');
  assert.equal(state.lines.nextRefreshLabel, '下次刷新 18:17:00');
});

test('buildMenuBarState shows a busy refresh action while refreshing', () => {
  const state = buildMenuBarState({
    refreshedAt: '2026-06-06T10:12:00.000Z',
    refreshStatus: {
      phase: 'refreshing',
      dataSource: 'codex_app_server',
      freshness: 'fresh',
      lastAttemptAt: '2026-06-06T10:12:00.000Z',
      lastSuccessAt: '2026-06-06T10:12:00.000Z',
      lastFailureAt: null,
      nextScheduledRefreshAt: null,
      failureReason: null,
      isRetryingAfterWake: false,
      retryAttempt: null
    },
    summary: {
      remainingPercent: 64,
      remaining: 64,
      used: 36,
      limit: 100,
      presentation: 'percent',
      windowState: 'healthy',
      nextRecoveryAt: '2026-06-06T10:30:00.000Z'
    },
    weeklySummary: {
      remainingPercent: 87,
      remaining: 87,
      used: 13,
      limit: 100,
      nextRecoveryAt: '2026-06-11T10:30:00.000Z'
    },
    prediction: {
      hoursRemaining: 5,
      burnRatePerHour: 7.2,
      recommendedIntensity: 'current',
      recommendation: '当前消耗速度平稳，建议保持当前节奏。'
    },
    flowAdvice: {
      level: 'light',
      title: '适合小步推进',
      message: '额度还行，先做小任务或拆分推进。',
      recommendedWork: ['小功能', '修 bug', '补测试'],
      avoidWork: ['大重构', '跨模块改动'],
      basedOnStaleData: false
    },
    preferences: {
      isActive: true,
      isHighIntensity: false,
      showPercentageInMenuBar: true
    }
  });

  assert.equal(state.refreshAction.label, '刷新中…');
  assert.equal(state.refreshAction.enabled, false);
});

test('buildMenuBarState handles unavailable live quota data gracefully', () => {
  const state = buildMenuBarState({
    refreshedAt: '2026-06-09T03:16:55.878Z',
    refreshStatus: {
      phase: 'failed',
      dataSource: 'unknown',
      freshness: 'unknown',
      lastAttemptAt: '2026-06-09T03:16:55.878Z',
      lastSuccessAt: null,
      lastFailureAt: '2026-06-09T03:16:55.878Z',
      nextScheduledRefreshAt: '2026-06-09T03:21:55.878Z',
      failureReason: 'codex app-server request timed out',
      isRetryingAfterWake: false,
      retryAttempt: null
    },
    source: {
      label: 'codex-account-rate-limits',
      file: 'codex app-server account/rateLimits/read'
    },
    summary: null,
    weeklySummary: null,
    prediction: null,
    preferences: {
      isActive: true,
      isHighIntensity: false,
      showPercentageInMenuBar: true
    },
    refreshInterval: 300000
  });

  assert.equal(state.title, '--');
  assert.equal(state.toolTip, 'Codex Monitor：周 暂无 · 5小时 暂无 · 暂无 · 刷新失败');
  assert.equal(state.lines.overviewLabel, '周 暂无 · 5小时 暂无');
  assert.equal(state.lines.statusLabel, '状态 暂无 · 未知来源 · 未知');
  assert.equal(state.lines.adviceLabel, '建议 先等数据');
  assert.equal(state.lines.nextRefreshLabel, '下次刷新 11:21:55');
});

test('formatRefreshLabel returns the low-frequency refresh label', () => {
  assert.equal(formatRefreshLabel(10 * 60 * 1000), '下次刷新约 10 分钟后');
  assert.equal(formatRefreshLabel(30 * 1000), '下次刷新约 30 秒后');
});
