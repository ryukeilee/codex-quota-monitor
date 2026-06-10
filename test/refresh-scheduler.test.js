import test from 'node:test';
import assert from 'node:assert/strict';

import { createRefreshScheduler } from '../src/monitor/refresh-scheduler.js';

function createDashboard(overrides = {}) {
  return {
    refreshInterval: 5 * 60 * 1000,
    source: {
      origin: 'codex_app_server'
    },
    summary: {
      remainingPercent: 72
    },
    refreshStatus: {
      phase: 'success',
      dataSource: 'codex_app_server',
      failureReason: null
    },
    ...overrides
  };
}

function createFakeClock(startAt = '2026-06-10T00:00:00.000Z') {
  let currentTime = new Date(startAt).getTime();
  let nextId = 0;
  const timers = new Map();

  return {
    now: () => currentTime,
    setTimeoutFn(callback, delayMs) {
      const handle = { id: ++nextId };
      timers.set(handle, {
        callback,
        runAt: currentTime + delayMs
      });
      return handle;
    },
    clearTimeoutFn(handle) {
      timers.delete(handle);
    },
    async advanceBy(delayMs) {
      currentTime += delayMs;

      while (true) {
        const dueEntry = [...timers.entries()]
          .sort((left, right) => left[1].runAt - right[1].runAt)
          .find(([, timer]) => timer.runAt <= currentTime);

        if (!dueEntry) {
          break;
        }

        const [handle, timer] = dueEntry;
        timers.delete(handle);
        await timer.callback();
      }
    },
    pendingTimerCount() {
      return timers.size;
    }
  };
}

test('start keeps only one scheduled timer when the dashboard is rescheduled', () => {
  const clock = createFakeClock();
  const scheduler = createRefreshScheduler({
    runRefresh: async () => createDashboard(),
    now: clock.now,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn
  });

  scheduler.start(createDashboard({
    refreshInterval: 5 * 60 * 1000
  }));
  assert.equal(clock.pendingTimerCount(), 1);

  scheduler.start(createDashboard({
    refreshInterval: 60 * 1000
  }));
  assert.equal(clock.pendingTimerCount(), 1);
  assert.equal(scheduler.getSnapshot().schedulerState, 'idle');
});

test('manual refresh dedupes in-flight work and keeps a single next timer', async () => {
  const clock = createFakeClock();
  let resolveRefresh;
  let callCount = 0;
  const runRefresh = () => {
    callCount += 1;
    return new Promise((resolve) => {
      resolveRefresh = () => resolve(createDashboard({
        refreshInterval: 60 * 1000
      }));
    });
  };
  const scheduler = createRefreshScheduler({
    runRefresh,
    now: clock.now,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn
  });

  scheduler.start(createDashboard());
  const firstRefresh = scheduler.requestRefresh({
    reason: 'manual'
  });
  const secondRefresh = scheduler.requestRefresh({
    reason: 'manual'
  });

  assert.equal(firstRefresh, secondRefresh);
  assert.equal(callCount, 1);

  resolveRefresh();
  await firstRefresh;
  assert.equal(clock.pendingTimerCount(), 1);
  assert.equal(scheduler.getSnapshot().schedulerState, 'idle');
});

test('degraded refresh results enter backoff instead of normal cadence', async () => {
  const clock = createFakeClock();
  const scheduler = createRefreshScheduler({
    runRefresh: async () => createDashboard({
      source: {
        origin: 'local_snapshot'
      },
      refreshStatus: {
        phase: 'using_snapshot',
        dataSource: 'local_snapshot',
        failureReason: 'codex app-server timed out'
      }
    }),
    now: clock.now,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn
  });

  await scheduler.requestRefresh({
    reason: 'manual'
  });

  const snapshot = scheduler.getSnapshot();
  assert.equal(snapshot.schedulerState, 'backoff');
  assert.equal(snapshot.hasTimer, true);
  assert.equal(clock.pendingTimerCount(), 1);
});

test('sleep and wake retries pause timers until live refresh recovers', async () => {
  const clock = createFakeClock();
  const calls = [];
  const responses = [
    createDashboard({
      source: {
        origin: 'local_snapshot'
      },
      refreshStatus: {
        phase: 'using_snapshot',
        dataSource: 'local_snapshot',
        failureReason: 'wake retry still stale'
      }
    }),
    createDashboard({
      refreshInterval: 60 * 1000
    })
  ];
  const scheduler = createRefreshScheduler({
    runRefresh: async (options) => {
      calls.push(options);
      return responses.shift();
    },
    now: clock.now,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn
  });

  scheduler.start(createDashboard());
  scheduler.markSleeping();
  assert.equal(scheduler.getSnapshot().schedulerState, 'sleeping');
  assert.equal(clock.pendingTimerCount(), 0);

  scheduler.resumeFromSleep('resume');
  assert.equal(scheduler.getSnapshot().schedulerState, 'paused');
  assert.equal(scheduler.getSnapshot().isRetryingAfterWake, true);
  assert.equal(clock.pendingTimerCount(), 1);

  await clock.advanceBy(5 * 1000);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].reason, 'resume');
  assert.equal(calls[0].retryAttempt, 1);
  assert.equal(scheduler.getSnapshot().schedulerState, 'paused');
  assert.equal(clock.pendingTimerCount(), 1);

  await clock.advanceBy(15 * 1000);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].reason, 'resume');
  assert.equal(calls[1].retryAttempt, 2);
  assert.equal(scheduler.getSnapshot().schedulerState, 'idle');
  assert.equal(scheduler.getSnapshot().isRetryingAfterWake, false);
  assert.equal(clock.pendingTimerCount(), 1);
});
