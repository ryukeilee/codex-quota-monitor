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

export async function createMonitorService({ onUpdated, onNotify, logger, getSystemPreferences, applySystemPreferences }) {
  const database = createDatabase();
  const currentCwd = process.cwd();
  let reader = createSnapshotSourceRouter({
    fiveHourBudget: DEFAULT_PREFERENCES.fiveHourBudget,
    cwd: currentCwd
  });
  let refreshTimer = null;
  let dashboard = null;
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
      await refreshNow();
    }, currentDashboard.refreshInterval);
  }

  async function refreshNow() {
    const persistedPreferences = database.getPreferences();
    const now = new Date();

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
      logger.info({
        error: error?.message ?? String(error)
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

    writeDashboardArtifact(dashboard);
    scheduleNextRefresh(dashboard);
    maybeNotify(dashboard);
    onUpdated(dashboard);
    logger.info({
      remainingPercent: dashboard.summary.remainingPercent,
      sourceLabel: dashboard.source.label
    }, 'dashboard refreshed');
    return dashboard;
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
      return refreshNow();
    },
    getDashboard() {
      return dashboard;
    },
    async refreshNow() {
      return refreshNow();
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
      return refreshNow();
    },
    async dispose() {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      database.close();
    }
  };
}
