import { summarizeUsage, getRefreshInterval } from '../core/quota-math.js';
import { mergeSystemPreferences } from '../core/system-preferences.js';
import { predictFlow } from '../predictor/flow-predictor.js';
import { buildIncrementalUsageRecords } from '../session/thread-usage-delta.js';
import { createDatabase } from '../storage/database.js';
import { createSnapshotSourceRouter } from '../session/snapshot-source-router.js';
import { readLiveRateLimits } from '../session/codex-rate-limit-reader.js';
import { writeDashboardArtifact } from '../utils/dashboard-artifact.js';

const LEGACY_FIVE_HOUR_BUDGET = 10_000_000;
const CALIBRATED_LOCAL_FIVE_HOUR_BUDGET = 25_071_924;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const LIVE_RATE_LIMIT_REFRESH_FLOOR_MS = 5 * 60 * 1000;
const FORCE_DEDUPE_MS = 10_000;
const REFRESH_STATE_DEFAULTS = {
  isRefreshing: false,
  lastSuccessfulRefreshAt: null,
  lastRefreshStartedAt: null,
  lastRefreshError: null,
  lastForcedRefreshAt: null
};
const DEFAULT_PREFERENCES = {
  isActive: true,
  isHighIntensity: false,
  fiveHourBudget: CALIBRATED_LOCAL_FIVE_HOUR_BUDGET,
  weeklyBudget: CALIBRATED_LOCAL_FIVE_HOUR_BUDGET * 7,
  showPercentageInMenuBar: true,
  closeToMenuBar: true,
  notificationsEnabled: true,
  autoLaunchEnabled: false,
  pureMenuBarMode: false,
  showMiniPanelOnTrayClick: true
};

function createRefreshState(overrides = {}) {
  return {
    ...REFRESH_STATE_DEFAULTS,
    ...overrides
  };
}

function computeIsStale({ lastSuccessfulRefreshAt, refreshInterval, now = new Date() }) {
  if (!lastSuccessfulRefreshAt) {
    return true;
  }

  return now.getTime() - new Date(lastSuccessfulRefreshAt).getTime() >= refreshInterval;
}

export async function createMonitorService({ onUpdated, onNotify, logger, getSystemPreferences, applySystemPreferences }) {
  const database = createDatabase();
  const currentCwd = process.cwd();
  let reader = createSnapshotSourceRouter({
    fiveHourBudget: DEFAULT_PREFERENCES.fiveHourBudget,
    cwd: currentCwd
  });
  let refreshTimer = null;
  let dashboard = null;
  let refreshState = createRefreshState();
  let lastNotifiedState = null;

  function materializeUsageRecords(snapshot, now = new Date()) {
    if (snapshot.sourceLabel !== 'local-codex-session-state') {
      return snapshot.records;
    }

    const threadIds = snapshot.records
      .map((record) => record.threadId)
      .filter(Boolean);
    const previousByThread = database.getThreadUsageState(threadIds);
    const { usageRecords, nextStateByThread } = buildIncrementalUsageRecords({
      records: snapshot.records,
      previousByThread,
      now
    });

    database.upsertThreadUsageState(nextStateByThread);
    return usageRecords;
  }

  function mergePreferences(snapshot, persisted) {
    const fiveHourBudget = persisted.fiveHourBudget ?? snapshot.limit ?? DEFAULT_PREFERENCES.fiveHourBudget;
    const weeklyBudget = persisted.weeklyBudget ?? (fiveHourBudget * 7);

    return mergeSystemPreferences({
      isActive: persisted.isActive ?? snapshot.isActive ?? DEFAULT_PREFERENCES.isActive,
      isHighIntensity: persisted.isHighIntensity ?? snapshot.isHighIntensity ?? DEFAULT_PREFERENCES.isHighIntensity,
      fiveHourBudget,
      weeklyBudget,
      showPercentageInMenuBar: persisted.showPercentageInMenuBar ?? DEFAULT_PREFERENCES.showPercentageInMenuBar,
      closeToMenuBar: persisted.closeToMenuBar ?? DEFAULT_PREFERENCES.closeToMenuBar,
      notificationsEnabled: persisted.notificationsEnabled ?? DEFAULT_PREFERENCES.notificationsEnabled,
      autoLaunchEnabled: persisted.autoLaunchEnabled ?? DEFAULT_PREFERENCES.autoLaunchEnabled,
      pureMenuBarMode: persisted.pureMenuBarMode ?? DEFAULT_PREFERENCES.pureMenuBarMode,
      showMiniPanelOnTrayClick: persisted.showMiniPanelOnTrayClick ?? DEFAULT_PREFERENCES.showMiniPanelOnTrayClick
    }, getSystemPreferences ? getSystemPreferences() : {});
  }

  function buildDashboard(snapshot, preferences, sourceFile, summary, storedUsageRecords, overrides = {}) {
    const now = new Date();
    const weeklySummary = overrides.weeklySummary ?? summarizeUsage({
      limit: preferences.weeklyBudget ?? (preferences.fiveHourBudget * 7),
      now,
      records: storedUsageRecords,
      windowMs: SEVEN_DAYS_MS
    });
    const prediction = predictFlow({
      summary,
      records: storedUsageRecords.length > 0 ? storedUsageRecords : snapshot.records,
      now
    });
    const history = database.getRecentSnapshots(48);
    const baseRefreshInterval = getRefreshInterval({
      isActive: preferences.isActive,
      isHighIntensity: preferences.isHighIntensity,
      remainingPercent: summary.remainingPercent
    });
    const refreshInterval = overrides.refreshInterval ?? baseRefreshInterval;

    return {
      refreshedAt: now.toISOString(),
      source: {
        label: overrides.sourceLabel ?? snapshot.sourceLabel,
        file: sourceFile
      },
      preferences,
      summary,
      weeklySummary,
      prediction,
      refreshInterval,
      history,
      recentRecords: storedUsageRecords.slice(-12).reverse()
    };
  }

  function mergeDashboardRefreshState(currentDashboard) {
    if (!currentDashboard) {
      return currentDashboard;
    }

    return {
      ...currentDashboard,
      ...refreshState,
      isStale: computeIsStale({
        lastSuccessfulRefreshAt: refreshState.lastSuccessfulRefreshAt,
        refreshInterval: currentDashboard.refreshInterval
      })
    };
  }

  function markRefreshStarted({ force = false } = {}) {
    const startedAt = new Date().toISOString();
    refreshState = createRefreshState({
      ...refreshState,
      isRefreshing: true,
      lastRefreshStartedAt: startedAt,
      lastRefreshError: null,
      lastForcedRefreshAt: force ? startedAt : refreshState.lastForcedRefreshAt
    });

    if (dashboard) {
      dashboard = mergeDashboardRefreshState(dashboard);
      onUpdated(dashboard);
    }

    return startedAt;
  }

  function markRefreshFinished({ successAt = null, error = null } = {}) {
    refreshState = createRefreshState({
      ...refreshState,
      isRefreshing: false,
      lastSuccessfulRefreshAt: successAt ?? refreshState.lastSuccessfulRefreshAt,
      lastRefreshError: error
    });
  }

  function maybeNotify(currentDashboard) {
    if (!currentDashboard.preferences.notificationsEnabled) {
      lastNotifiedState = currentDashboard.summary.windowState;
      return;
    }

    const state = currentDashboard.summary.windowState;
    if (state === 'near_limit' && lastNotifiedState !== state) {
      onNotify({
        title: 'Codex 剩余额度偏低',
        body: `当前仅剩 ${currentDashboard.summary.remainingPercent}% ，建议降低推理强度。`
      });
    }

    if (currentDashboard.summary.nextRecoveryAt && lastNotifiedState !== 'recovery') {
      const recoveryAt = new Date(currentDashboard.summary.nextRecoveryAt).getTime();
      const now = Date.now();
      const delta = recoveryAt - now;
      if (delta > 0 && delta <= 15 * 60 * 1000) {
        onNotify({
          title: 'Codex 额度即将恢复',
          body: `下一次恢复时间约为 ${currentDashboard.summary.nextRecoveryAt}。`
        });
        lastNotifiedState = 'recovery';
        return;
      }
    }

    lastNotifiedState = state;
  }

  function scheduleNextRefresh(currentDashboard) {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }
    refreshTimer = setTimeout(async () => {
      try {
        await refreshQuota({
          reason: 'timer',
          force: false
        });
      } catch (error) {
        logger.error({
          error: error?.message ?? String(error)
        }, 'scheduled refresh failed');
      }
    }, currentDashboard.refreshInterval);
  }

  async function refreshQuota({ reason = 'manual', force = false } = {}) {
    if (refreshState.isRefreshing) {
      logger.debug({
        reason,
        force,
        cause: 'in-flight'
      }, 'refresh skipped');
      if (dashboard) {
        scheduleNextRefresh(dashboard);
      }
      return dashboard;
    }

    if (force && refreshState.lastForcedRefreshAt) {
      const elapsedMs = Date.now() - new Date(refreshState.lastForcedRefreshAt).getTime();
      if (elapsedMs < FORCE_DEDUPE_MS && dashboard) {
        logger.debug({
          reason,
          force,
          cause: 'forced-deduped',
          elapsedMs
        }, 'refresh skipped');
        if (dashboard) {
          scheduleNextRefresh(dashboard);
        }
        return dashboard;
      }
    }

    logger.debug({
      reason,
      force
    }, 'refresh start');

    markRefreshStarted({ force });
    const persistedPreferences = database.getPreferences();
    const now = new Date();
    let refreshError = null;

    try {
      try {
        const liveRateLimits = await readLiveRateLimits({ cwd: currentCwd });
        const liveSnapshot = {
          sourceLabel: liveRateLimits.sourceLabel,
          limit: liveRateLimits.primary.limit,
          isActive: true,
          isHighIntensity: false,
          records: []
        };
        const preferences = mergePreferences(liveSnapshot, persistedPreferences);
        const liveRefreshInterval = Math.max(
          getRefreshInterval({
            isActive: preferences.isActive,
            isHighIntensity: preferences.isHighIntensity,
            remainingPercent: liveRateLimits.primary.remainingPercent
          }),
          LIVE_RATE_LIMIT_REFRESH_FLOOR_MS
        );

        database.saveSnapshot({
          capturedAt: now.toISOString(),
          summary: liveRateLimits.primary,
          sourceLabel: liveRateLimits.sourceLabel
        });

        dashboard = buildDashboard(
          liveSnapshot,
          preferences,
          'codex app-server account/rateLimits/read',
          liveRateLimits.primary,
          [],
          {
            weeklySummary: liveRateLimits.secondary,
            sourceLabel: liveRateLimits.sourceLabel,
            refreshInterval: liveRefreshInterval
          }
        );
      } catch (error) {
        refreshError = error?.message ?? String(error);
        logger.info({
          error: refreshError
        }, 'live rate-limit read failed, falling back to local snapshot data');

        reader = createSnapshotSourceRouter({
          fiveHourBudget: persistedPreferences.fiveHourBudget ?? DEFAULT_PREFERENCES.fiveHourBudget,
          cwd: currentCwd
        });
        const { snapshot, sourceFile } = await reader.readSnapshot();
        const preferences = mergePreferences(snapshot, persistedPreferences);
        const usageRecords = materializeUsageRecords(snapshot, now);

        database.saveUsageRecords(usageRecords);
        const usageHistoryStart = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
        const storedUsageRecords = database.getUsageRecordsSince(usageHistoryStart);

        const summary = summarizeUsage({
          limit: snapshot.limit,
          now,
          records: storedUsageRecords
        });

        database.saveSnapshot({
          capturedAt: now.toISOString(),
          summary,
          sourceLabel: snapshot.sourceLabel
        });

        dashboard = buildDashboard(snapshot, preferences, sourceFile, summary, storedUsageRecords);
      }

      if (!dashboard) {
        throw new Error(refreshError ?? 'dashboard refresh failed');
      }

      markRefreshFinished({
        successAt: dashboard.refreshedAt,
        error: refreshError
      });
      dashboard = mergeDashboardRefreshState(dashboard);
      writeDashboardArtifact(dashboard);
      scheduleNextRefresh(dashboard);
      maybeNotify(dashboard);
      onUpdated(dashboard);
      logger.debug({
        reason,
        force,
        remainingPercent: dashboard.summary.remainingPercent,
        sourceLabel: dashboard.source.label
      }, 'refresh success');
      return dashboard;
    } catch (error) {
      const errorMessage = error?.message ?? String(error);
      markRefreshFinished({
        error: errorMessage
      });
      if (dashboard) {
        dashboard = mergeDashboardRefreshState(dashboard);
        writeDashboardArtifact(dashboard);
        onUpdated(dashboard);
        scheduleNextRefresh(dashboard);
      }
      logger.error({
        reason,
        force,
        error: errorMessage
      }, 'refresh failed');
      throw error;
    }
  }

  return {
    async init() {
      const persistedPreferences = database.getPreferences();

      if (persistedPreferences.usageTrackingMode !== 'thread-delta-v1') {
        database.clearUsageTracking();
        persistedPreferences.usageTrackingMode = 'thread-delta-v1';
      }

      if (persistedPreferences.budgetPresetVersion !== 'local-state-v4') {
        persistedPreferences.fiveHourBudget = DEFAULT_PREFERENCES.fiveHourBudget;
        persistedPreferences.weeklyBudget = DEFAULT_PREFERENCES.weeklyBudget;
        persistedPreferences.budgetPresetVersion = 'local-state-v4';
      }

      if (persistedPreferences.weeklyBudget == null) {
        persistedPreferences.weeklyBudget = (persistedPreferences.fiveHourBudget ?? DEFAULT_PREFERENCES.fiveHourBudget) * 7;
      }

      const mergedDefaults = mergeSystemPreferences({
        ...DEFAULT_PREFERENCES,
        ...persistedPreferences
      }, getSystemPreferences ? getSystemPreferences() : {});
      database.upsertPreferences(mergedDefaults);
      return refreshQuota({
        reason: 'startup',
        force: true
      });
    },
    getDashboard() {
      return dashboard;
    },
    async refreshQuota(options = {}) {
      return refreshQuota(options);
    },
    async refreshNow() {
      return refreshQuota({
        reason: 'manual',
        force: true
      });
    },
    async updatePreferences(preferences) {
      const nextPreferences = {
        ...preferences
      };
      if (nextPreferences.fiveHourBudget != null && nextPreferences.weeklyBudget == null) {
        nextPreferences.weeklyBudget = nextPreferences.fiveHourBudget * 7;
      }
      database.upsertPreferences(nextPreferences);
      if (applySystemPreferences) {
        await applySystemPreferences({
          ...database.getPreferences(),
          ...nextPreferences
        });
      }
      return refreshQuota({
        reason: 'preferences',
        force: true
      });
    },
    async dispose() {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      database.close();
    }
  };
}
