import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createRefreshStatus,
  computeFreshness,
  formatRefreshStatus
} from '../src/core/refresh-status.js';

test('computeFreshness classifies recent data within the refresh window', () => {
  assert.equal(
    computeFreshness({
      lastSuccessAt: '2026-06-09T03:10:00.000Z',
      refreshInterval: 5 * 60 * 1000,
      now: new Date('2026-06-09T03:11:00.000Z')
    }),
    'fresh'
  );

  assert.equal(
    computeFreshness({
      lastSuccessAt: '2026-06-09T03:05:30.000Z',
      refreshInterval: 5 * 60 * 1000,
      now: new Date('2026-06-09T03:11:00.000Z')
    }),
    'recent'
  );

  assert.equal(
    computeFreshness({
      lastSuccessAt: '2026-06-09T02:30:00.000Z',
      refreshInterval: 5 * 60 * 1000,
      now: new Date('2026-06-09T03:11:00.000Z')
    }),
    'stale'
  );
});

test('formatRefreshStatus exposes readable labels for menu and tray copy', () => {
  const status = createRefreshStatus({
    phase: 'using_snapshot',
    dataSource: 'local_snapshot',
    freshness: 'recent'
  });

  assert.deepEqual(formatRefreshStatus(status), {
    phaseLabel: '使用回退数据',
    dataSourceLabel: '本地快照',
    freshnessLabel: '最近'
  });
});
