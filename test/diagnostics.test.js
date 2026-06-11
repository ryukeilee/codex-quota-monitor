import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { createDiagnosticsStore } from '../src/monitor/diagnostics.js';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codex-monitor-diagnostics-'));
}

test('diagnostic logs are capped at 200 events', () => {
  const store = createDiagnosticsStore({
    storageRoot: makeTempDir()
  });

  for (let index = 0; index < 205; index += 1) {
    store.recordRefreshEvent({
      timestamp: 1000 + index,
      reason: 'auto',
      result: 'success',
      source: 'wham_usage',
      message: `event-${index}`
    });
  }

  const events = store.getRecentEvents();
  assert.equal(events.length, 200);
  assert.equal(events[0].message, 'event-5');
  assert.equal(events[199].message, 'event-204');
});

test('diagnostic export does not include sensitive fields', () => {
  const store = createDiagnosticsStore({
    storageRoot: makeTempDir()
  });

  store.recordRefreshEvent({
    timestamp: new Date('2026-06-12T07:42:00.000Z').getTime(),
    reason: 'wake',
    result: 'success',
    source: 'wham_usage',
    message: 'authorization: Bearer secret-token user@example.com cookie=abc123'
  });

  const report = store.buildDiagnosticText({
    dashboard: {
      refreshStatus: {
        lastAttemptAt: '2026-06-12T07:42:00.000Z',
        lastSuccessAt: '2026-06-12T07:42:00.000Z',
        nextScheduledRefreshAt: '2026-06-12T07:47:00.000Z',
        lastRefreshReason: 'wake',
        failureReason: null
      },
      quotaHealth: {
        level: 'healthy',
        source: 'wham_usage',
        lastRefreshAt: new Date('2026-06-12T07:42:00.000Z').getTime(),
        lastSuccessfulRefreshAt: new Date('2026-06-12T07:42:00.000Z').getTime(),
        nextAutoRefreshAt: new Date('2026-06-12T07:47:00.000Z').getTime(),
        dataAgeMs: 72_000,
        isFallback: false,
        isStale: false,
        isRefreshing: false,
        lastRefreshReason: 'wake',
        lastErrorMessage: null
      }
    }
  });

  assert.match(report, /Data Status: healthy/);
  assert.match(report, /Data Source: wham\/usage/);
  assert.doesNotMatch(report, /secret-token|user@example.com|cookie=abc123|authorization/i);
});
