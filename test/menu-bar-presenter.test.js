import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMenuBarState,
  formatRefreshLabel
} from '../src/notification/menu-bar-presenter.js';

test('buildMenuBarState exposes percentage title and concise tray menu labels', () => {
  const state = buildMenuBarState({
    refreshedAt: '2026-06-06T10:12:00.000Z',
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
    preferences: {
      showPercentageInMenuBar: true
    }
  });

  assert.equal(state.title, '87%');
  assert.equal(state.toolTip, 'Codex Monitor：周额度剩余 87%');
  assert.equal(state.lines.weeklyLabel, '周额度 87% 剩余');
  assert.equal(state.lines.weeklyResetLabel, '重置于 06/11 18:30');
  assert.equal(state.lines.windowLabel, '5 小时窗口 64% 剩余');
  assert.equal(state.lines.recoveryLabel, '5 小时恢复 06/06 18:30');
  assert.equal(state.lines.lastRefreshLabel, '最近刷新 18:12:00');
});

test('buildMenuBarState keeps the tray title as a plain percentage when quota is near limit', () => {
  const state = buildMenuBarState({
    refreshedAt: '2026-06-06T10:12:00.000Z',
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
    preferences: {
      showPercentageInMenuBar: true
    },
    refreshInterval: 15000
  });

  assert.equal(state.title, '87%');
  assert.equal(state.lines.windowLabel, '5 小时窗口 12% 剩余');
});

test('buildMenuBarState hides title text when menu bar display is disabled', () => {
  const state = buildMenuBarState({
    refreshedAt: '2026-06-06T10:12:00.000Z',
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
    preferences: {
      showPercentageInMenuBar: false
    }
  });

  assert.equal(state.title, '');
  assert.equal(state.lines.recoveryLabel, '5 小时恢复 暂无');
  assert.equal(state.lines.weeklyLabel, '周额度 87% 剩余');
  assert.equal(state.lines.weeklyResetLabel, '重置于 06/11 18:30');
});

test('formatRefreshLabel returns the low-frequency refresh label', () => {
  assert.equal(formatRefreshLabel(10 * 60 * 1000), '下次刷新约 10 分钟后');
  assert.equal(formatRefreshLabel(30 * 1000), '下次刷新约 30 秒后');
});
