import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readDashboardArtifact, writeDashboardArtifact } from '../src/utils/dashboard-artifact.js';

test('readDashboardArtifact returns the latest dashboard snapshot when present', () => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-monitor-dashboard-'));

  try {
    const dashboard = {
      refreshedAt: '2026-06-09T02:10:37.541Z',
      source: {
        label: 'codex-account-rate-limits',
        file: 'codex app-server account/rateLimits/read'
      },
      preferences: {
        isActive: true,
        isHighIntensity: false,
        fiveHourBudget: 25071924,
        weeklyBudget: 175503468,
        showPercentageInMenuBar: true,
        closeToMenuBar: true,
        notificationsEnabled: true,
        autoLaunchEnabled: true,
        pureMenuBarMode: true
      },
      summary: {
        limit: 100,
        used: 40,
        remaining: 60,
        remainingPercent: 60,
        windowUsageCount: 0,
        windowState: 'healthy',
        nextRecoveryAt: '2026-06-09T05:41:50.000Z',
        presentation: 'percent',
        windowDurationMins: 300
      },
      weeklySummary: {
        limit: 100,
        used: 55,
        remaining: 45,
        remainingPercent: 45,
        windowUsageCount: 0,
        windowState: 'healthy',
        nextRecoveryAt: '2026-06-11T09:37:16.000Z',
        presentation: 'percent',
        windowDurationMins: 10080
      },
      prediction: {
        burnRatePerHour: 0,
        hoursRemaining: null,
        willHitWall: false,
        recommendedIntensity: 'current',
        recommendation: '当前暂无消耗记录，继续观察即可。'
      },
      flowAdvice: {
        level: 'good',
        title: '适合开大任务',
        message: '额度充足，适合推进新功能或重构。',
        recommendedWork: ['新功能', '重构', '长任务'],
        avoidWork: ['频繁切换', '碎片化跟进'],
        basedOnStaleData: false
      },
      refreshInterval: 300000,
      history: [],
      recentRecords: []
    };

    writeDashboardArtifact(dashboard, baseDir);

    const result = readDashboardArtifact(baseDir);

    assert.deepEqual(result?.summary, dashboard.summary);
    assert.deepEqual(result?.weeklySummary, dashboard.weeklySummary);
    assert.equal(result?.source?.label, dashboard.source.label);
    assert.deepEqual(result?.flowAdvice, dashboard.flowAdvice);
  } finally {
    fs.rmSync(baseDir, { recursive: true, force: true });
  }
});

test('readDashboardArtifact ignores local session dashboards that are not live quota data', () => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-monitor-dashboard-'));

  try {
    const dataDir = path.join(baseDir, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'latest-dashboard.json'), JSON.stringify({
      source: {
        label: 'local-codex-session-state',
        file: '/Users/ryukeili/.codex/state_5.sqlite'
      },
      summary: {
        remainingPercent: 0
      }
    }));

    assert.equal(readDashboardArtifact(baseDir), null);
  } finally {
    fs.rmSync(baseDir, { recursive: true, force: true });
  }
});
