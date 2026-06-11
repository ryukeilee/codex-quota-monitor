const DEFAULT_BACKOFF_DELAYS_MS = [
  30 * 1000,
  60 * 1000,
  5 * 60 * 1000,
  15 * 60 * 1000
];

const DEFAULT_WAKE_RETRY_DELAYS_MS = [
  5 * 1000,
  15 * 1000,
  30 * 1000,
  60 * 1000
];

function createNoopLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {}
  };
}

function clampDelay(delayMs, fallbackMs = 5 * 60 * 1000) {
  return Number.isFinite(delayMs) && delayMs > 0 ? delayMs : fallbackMs;
}

function isDegradedDashboard(dashboard) {
  if (!dashboard?.summary) {
    return true;
  }

  const phase = dashboard.refreshStatus?.phase;
  const dataSource = dashboard.refreshStatus?.dataSource ?? dashboard.source?.origin ?? 'unknown';
  return phase === 'failed'
    || phase === 'using_snapshot'
    || Boolean(dashboard.refreshStatus?.failureReason)
    || dataSource !== 'codex_app_server';
}

function isRecoveredWakeDashboard(dashboard) {
  if (!dashboard?.summary) {
    return false;
  }

  const dataSource = dashboard.refreshStatus?.dataSource ?? dashboard.source?.origin ?? 'unknown';
  return dataSource === 'codex_app_server' && !dashboard.refreshStatus?.failureReason;
}

export function createRefreshScheduler({
  runRefresh,
  onStateChange,
  logger = createNoopLogger(),
  now = () => Date.now(),
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  backoffDelaysMs = DEFAULT_BACKOFF_DELAYS_MS,
  wakeRetryDelaysMs = DEFAULT_WAKE_RETRY_DELAYS_MS
} = {}) {
  if (typeof runRefresh !== 'function') {
    throw new TypeError('runRefresh must be a function');
  }

  let timer = null;
  let inFlightRefresh = null;
  let disposed = false;
  let lastDashboard = null;
  let consecutiveFailures = 0;
  let schedulerState = 'idle';
  let nextScheduledRefreshAt = null;
  let isRetryingAfterWake = false;
  let retryAttempt = null;
  let wakeReason = 'resume';

  function publishState(overrides = {}) {
    onStateChange?.({
      schedulerState,
      nextScheduledRefreshAt,
      isRetryingAfterWake,
      retryAttempt,
      ...overrides
    });
  }

  function clearTimer() {
    if (timer) {
      clearTimeoutFn(timer);
      timer = null;
    }
    nextScheduledRefreshAt = null;
  }

  function scheduleTimer({
    delayMs,
    schedulerState: nextSchedulerState,
    reason,
    phase,
    isWakeRetry = false,
    nextRetryAttempt = null
  }) {
    if (disposed) {
      return;
    }

    clearTimer();
    schedulerState = nextSchedulerState;
    isRetryingAfterWake = isWakeRetry;
    retryAttempt = nextRetryAttempt;
    nextScheduledRefreshAt = new Date(now() + delayMs).toISOString();
    publishState({
      phase,
      nextScheduledRefreshAt
    });

    timer = setTimeoutFn(async () => {
      timer = null;
      nextScheduledRefreshAt = null;
      try {
        if (reason === 'wake-retry') {
          await triggerRefresh({
            reason: wakeReason,
            force: true,
            wakeRetryAttempt: nextRetryAttempt ?? 1
          });
          return;
        }

        await triggerRefresh({
          reason,
          force: reason !== 'timer'
        });
      } catch (error) {
        logger.error({
          reason,
          error: error?.message ?? String(error)
        }, 'scheduled refresh run failed');
      }
    }, delayMs);
  }

  function scheduleNormalRefresh(dashboard) {
    const delayMs = clampDelay(dashboard?.refreshInterval);
    scheduleTimer({
      delayMs,
      schedulerState: 'idle',
      reason: 'timer',
      phase: dashboard?.refreshStatus?.phase ?? 'idle',
      isWakeRetry: false,
      nextRetryAttempt: null
    });
  }

  function scheduleBackoffRefresh(dashboard) {
    const backoffIndex = Math.min(
      Math.max(consecutiveFailures - 1, 0),
      backoffDelaysMs.length - 1
    );
    const delayMs = clampDelay(backoffDelaysMs[backoffIndex]);
    scheduleTimer({
      delayMs,
      schedulerState: 'backoff',
      reason: 'backoff',
      phase: 'backoff',
      isWakeRetry: false,
      nextRetryAttempt: null
    });
    logger.info({
      delayMs,
      consecutiveFailures,
      dataSource: dashboard?.refreshStatus?.dataSource ?? dashboard?.source?.origin ?? 'unknown'
    }, 'refresh backoff scheduled');
  }

  function scheduleWakeRetry(attemptIndex = 0) {
    if (attemptIndex >= wakeRetryDelaysMs.length) {
      isRetryingAfterWake = false;
      retryAttempt = null;
      schedulerState = 'idle';
      publishState({
        phase: lastDashboard?.refreshStatus?.phase ?? 'idle'
      });
      if (lastDashboard) {
        if (isDegradedDashboard(lastDashboard)) {
          scheduleBackoffRefresh(lastDashboard);
        } else {
          scheduleNormalRefresh(lastDashboard);
        }
      }
      return;
    }

    const delayMs = clampDelay(wakeRetryDelaysMs[attemptIndex], 5 * 1000);
    scheduleTimer({
      delayMs,
      schedulerState: 'paused',
      reason: 'wake-retry',
      phase: 'sleep_recovering',
      isWakeRetry: true,
      nextRetryAttempt: attemptIndex + 1
    });
  }

  function applyRefreshResult(dashboard, { wakeRetryAttempt = null } = {}) {
    lastDashboard = dashboard ?? lastDashboard;

    if (!lastDashboard) {
      consecutiveFailures += 1;
      scheduleBackoffRefresh(lastDashboard);
      return lastDashboard;
    }

    if (wakeRetryAttempt != null) {
      if (isRecoveredWakeDashboard(lastDashboard)) {
        consecutiveFailures = 0;
        isRetryingAfterWake = false;
        retryAttempt = null;
        scheduleNormalRefresh(lastDashboard);
        return lastDashboard;
      }

      scheduleWakeRetry(wakeRetryAttempt);
      return lastDashboard;
    }

    if (isDegradedDashboard(lastDashboard)) {
      consecutiveFailures += 1;
      scheduleBackoffRefresh(lastDashboard);
      return lastDashboard;
    }

    consecutiveFailures = 0;
    scheduleNormalRefresh(lastDashboard);
    return lastDashboard;
  }

  function triggerRefresh({
    reason = 'manual',
    force = reason !== 'timer',
    wakeRetryAttempt = null
  } = {}) {
    if (disposed) {
      return lastDashboard;
    }

    if (inFlightRefresh) {
      return inFlightRefresh;
    }

    clearTimer();
    schedulerState = 'refreshing';
    isRetryingAfterWake = wakeRetryAttempt != null;
    retryAttempt = wakeRetryAttempt;
    publishState({
      phase: wakeRetryAttempt != null ? 'sleep_recovering' : 'refreshing',
      nextScheduledRefreshAt: null
    });

    inFlightRefresh = (async () => {
      try {
        const dashboard = await runRefresh({
          reason,
          force,
          isRetryingAfterWake: wakeRetryAttempt != null,
          retryAttempt: wakeRetryAttempt
        });
        return applyRefreshResult(dashboard, { wakeRetryAttempt });
      } catch (error) {
        consecutiveFailures += 1;
        isRetryingAfterWake = false;
        retryAttempt = null;
        scheduleBackoffRefresh(lastDashboard);
        throw error;
      } finally {
        inFlightRefresh = null;
      }
    })();

    return inFlightRefresh;
  }

  return {
    start(dashboard) {
      if (disposed) {
        return dashboard;
      }

      return applyRefreshResult(dashboard);
    },
    requestRefresh(options = {}) {
      return triggerRefresh(options);
    },
    markSleeping() {
      if (disposed) {
        return;
      }

      clearTimer();
      schedulerState = 'sleeping';
      isRetryingAfterWake = false;
      retryAttempt = null;
      publishState({
        phase: 'sleeping',
        nextScheduledRefreshAt: null
      });
    },
    resumeFromSleep(reason = 'resume') {
      if (disposed) {
        return;
      }

      logger.debug({ reason }, 'refresh scheduler resuming from sleep');
      clearTimer();
      wakeReason = reason;
      if (!lastDashboard) {
        void triggerRefresh({
          reason,
          force: true
        });
        return;
      }

      void triggerRefresh({
        reason,
        force: true,
        wakeRetryAttempt: 0
      });
    },
    dispose() {
      disposed = true;
      clearTimer();
    },
    getSnapshot() {
      return {
        schedulerState,
        nextScheduledRefreshAt,
        consecutiveFailures,
        isRetryingAfterWake,
        retryAttempt,
        hasTimer: Boolean(timer),
        hasInFlightRefresh: Boolean(inFlightRefresh)
      };
    }
  };
}
