import test from 'node:test';
import assert from 'node:assert/strict';

import { buildIncrementalUsageRecords } from '../src/session/thread-usage-delta.js';

test('buildIncrementalUsageRecords treats older existing threads as a zero baseline on first observation', () => {
  const result = buildIncrementalUsageRecords({
    now: new Date('2026-06-06T12:00:00.000Z'),
    records: [
      {
        threadId: 'thread-1',
        at: '2026-06-06T11:50:00.000Z',
        createdAt: '2026-06-05T01:00:00.000Z',
        totalTokens: 17776111,
        amount: 17776111,
        model: 'gpt-5.4',
        intensity: 'medium'
      }
    ],
    previousByThread: {}
  });

  assert.equal(result.usageRecords.length, 0);
  assert.deepEqual(result.nextStateByThread, {
    'thread-1': {
      lastSeenAt: '2026-06-06T11:50:00.000Z',
      lastTotalTokens: 17776111
    }
  });
});

test('buildIncrementalUsageRecords emits only the positive token delta for an existing thread', () => {
  const result = buildIncrementalUsageRecords({
    now: new Date('2026-06-06T12:00:00.000Z'),
    records: [
      {
        threadId: 'thread-1',
        at: '2026-06-06T11:59:00.000Z',
        createdAt: '2026-06-05T01:00:00.000Z',
        totalTokens: 17780000,
        amount: 17780000,
        model: 'gpt-5.4',
        intensity: 'medium'
      }
    ],
    previousByThread: {
      'thread-1': {
        lastSeenAt: '2026-06-06T11:50:00.000Z',
        lastTotalTokens: 17776111
      }
    }
  });

  assert.deepEqual(result.usageRecords, [
    {
      threadId: 'thread-1',
      at: '2026-06-06T11:59:00.000Z',
      amount: 3889,
      model: 'gpt-5.4',
      intensity: 'medium'
    }
  ]);
});

test('buildIncrementalUsageRecords keeps full tokens for a newly created thread inside the 5 hour window', () => {
  const result = buildIncrementalUsageRecords({
    now: new Date('2026-06-06T12:00:00.000Z'),
    records: [
      {
        threadId: 'thread-2',
        at: '2026-06-06T11:58:00.000Z',
        createdAt: '2026-06-06T10:30:00.000Z',
        totalTokens: 120000,
        amount: 120000,
        model: 'gpt-5.4',
        intensity: 'high'
      }
    ],
    previousByThread: {}
  });

  assert.deepEqual(result.usageRecords, [
    {
      threadId: 'thread-2',
      at: '2026-06-06T11:58:00.000Z',
      amount: 120000,
      model: 'gpt-5.4',
      intensity: 'high'
    }
  ]);
});
