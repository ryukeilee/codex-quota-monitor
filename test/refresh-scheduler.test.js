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

test('manual refresh preempts a non-manual in-flight refresh', async () => {
  const clock = createFakeClock();
  const resolvers = [];
  let callCount = 0;
  const runRefresh = () => {
    callCount += 1;
    return new Promise((resolve) => {
      resolvers.push(() => resolve(createDashboard({
        refreshInterval: 60 * 1000
      })));
    });
  };
  const scheduler = createRefreshScheduler({
    runRefresh,
    now: clock.now,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn
  });

  const startupRefresh = scheduler.requestRefresh({
    reason: 'startup',
    force: true
  });
  const manualRefresh = scheduler.requestRefresh({
    reason: 'manual'
  });

  assert.equal(callCount, 2);
  assert.notEqual(startupRefresh, manualRefresh);

  resolvers[1]();
  await manualRefresh;
  assert.equal(clock.pendingTimerCount(), 1);
  assert.equal(scheduler.getSnapshot().schedulerState, 'idle');

  resolvers[0]();
  await startupRefresh;
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

test('live wham usage refreshes stay on the normal cadence', async () => {
  const clock = createFakeClock();
  const scheduler = createRefreshScheduler({
    runRefresh: async () => createDashboard({
      source: {
        origin: 'wham_usage'
      },
      refreshStatus: {
        phase: 'success',
        dataSource: 'wham_usage',
        failureReason: null
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
  assert.equal(snapshot.schedulerState, 'idle');
  assert.equal(snapshot.hasTimer, true);
  assert.equal(clock.pendingTimerCount(), 1);
});

test('refresh watchdog releases the visible refreshing state when a refresh hangs', async () => {
  const clock = createFakeClock();
  const patches = [];
  const scheduler = createRefreshScheduler({
    runRefresh: async () => new Promise(() => {}),
    onStateChange: (patch) => {
      patches.push(patch);
    },
    now: clock.now,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
    refreshTimeoutMs: 10 * 1000
  });

  const refresh = scheduler.requestRefresh({
    reason: 'manual'
  });

  await clock.advanceBy(10 * 1000);
  await assert.rejects(refresh, /刷新超时/);

  assert.ok(patches.some((patch) => patch.phase === 'failed' && patch.failureReason === '刷新超时'));
  assert.equal(scheduler.getSnapshot().hasInFlightRefresh, false);
});

test('refresh watchdog rejects the hanging refresh so callers can recover', async () => {
  const clock = createFakeClock();
  const patches = [];
  const scheduler = createRefreshScheduler({
    runRefresh: async () => new Promise(() => {}),
    onStateChange: (patch) => {
      patches.push(patch);
    },
    now: clock.now,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
    refreshTimeoutMs: 10 * 1000
  });

  const refresh = scheduler.requestRefresh({
    reason: 'manual'
  });

  await clock.advanceBy(10 * 1000);
  await assert.rejects(refresh, /刷新超时/);

  assert.ok(patches.some((patch) => patch.phase === 'failed' && patch.failureReason === '刷新超时'));
  assert.equal(scheduler.getSnapshot().hasInFlightRefresh, false);
  assert.equal(scheduler.getSnapshot().schedulerState, 'backoff');
});

test('refresh watchdog re-enters the scheduling chain after a timeout', async () => {
  const clock = createFakeClock();
  let callCount = 0;
  const scheduler = createRefreshScheduler({
    runRefresh: async () => {
      callCount += 1;
      if (callCount === 1) {
        return new Promise(() => {});
      }

      return createDashboard({
        refreshInterval: 60 * 1000
      });
    },
    now: clock.now,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
    refreshTimeoutMs: 10 * 1000
  });

  scheduler.start(createDashboard());
  const firstRefresh = scheduler.requestRefresh({
    reason: 'manual'
  });

  await clock.advanceBy(10 * 1000);
  await assert.rejects(firstRefresh, /刷新超时/);

  assert.equal(scheduler.getSnapshot().schedulerState, 'backoff');
  assert.equal(scheduler.getSnapshot().hasTimer, true);

  await clock.advanceBy(30 * 1000);
  assert.equal(callCount, 2);
  assert.equal(scheduler.getSnapshot().schedulerState, 'idle');
  assert.equal(scheduler.getSnapshot().hasTimer, true);
});

test('sleep and wake retries trigger an immediate refresh before the retry chain continues', async () => {
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
  assert.equal(calls.length, 1);
  assert.equal(calls[0].reason, 'resume');
  assert.equal(calls[0].retryAttempt, 0);

  await Promise.resolve();
  assert.equal(scheduler.getSnapshot().schedulerState, 'paused');
  assert.equal(scheduler.getSnapshot().isRetryingAfterWake, true);
  assert.equal(clock.pendingTimerCount(), 1);

  await clock.advanceBy(5 * 1000);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].reason, 'resume');
  assert.equal(calls[1].retryAttempt, 1);
  assert.equal(scheduler.getSnapshot().schedulerState, 'paused');
  assert.equal(clock.pendingTimerCount(), 1);

  await clock.advanceBy(15 * 1000);
  assert.equal(calls.length, 3);
  assert.equal(calls[2].reason, 'resume');
  assert.equal(calls[2].retryAttempt, 2);
  assert.equal(scheduler.getSnapshot().schedulerState, 'idle');
  assert.equal(scheduler.getSnapshot().isRetryingAfterWake, false);
  assert.equal(clock.pendingTimerCount(), 1);
});
