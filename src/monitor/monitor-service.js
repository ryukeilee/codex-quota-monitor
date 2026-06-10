import { summarizeUsage, getRefreshInterval, buildUsageTrendHistory } from '../core/quota-math.js';
import { buildQuotaAlertStatus } from '../core/quota-alert.js';
import { mergeSystemPreferences } from '../core/system-preferences.js';
import { predictFlow } from '../predictor/flow-predictor.js';
import { buildFlowAdvice } from '../predictor/flow-advice.js';
import { buildIncrementalUsageRecords } from '../session/thread-usage-delta.js';
import { createDatabase } from '../storage/database.js';
import { createSnapshotSourceRouter } from '../session/snapshot-source-router.js';
import { readLiveRateLimits } from '../session/codex-rate-limit-reader.js';
import { readDashboardArtifact, writeDashboardArtifact } from '../utils/dashboard-artifact.js';
import {
  createRefreshStatus,
  computeFreshness
} from '../core/refresh-status.js';

const LEGACY_FIVE_HOUR_BUDGET = 10_000_000;
const CALIBRATED_LOCAL_FIVE_HOUR_BUDGET = 25_071_924;
const FIVE_HOUR_WINDOW_MS = 5 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const LIVE_RATE_LIMIT_REFRESH_FLOOR_MS = 5 * 60 * 1000;
const FORCE_DEDUPE_MS = 10_000;
const DEFAULT_PREFERENCES = {
  isActive: true,
  isHighIntensity: false,
  fiveHourBudget: CALIBRATED_LOCAL_FIVE_HOUR_BUDGET,
  weeklyBudget: CALIBRATED_LOCAL_FIVE_HOUR_BUDGET * 7,
  showPercentageInMenuBar: true,
  closeToMenuBar: true,
  notificationsEnabled: false,
  autoLaunchEnabled: false,
  pureMenuBarMode: true
};

function computeIsStale({ lastSuccessfulRefreshAt, refreshInterval, now = new Date() }) {
  if (!lastSuccessfulRefreshAt) {
    return true;
  }

  return now.getTime() - new Date(lastSuccessfulRefreshAt).getTime() >= refreshInterval;
}

export async function createMonitorService({
  onUpdated,
  onNotify,
  logger,
  getSystemPreferences,
  applySystemPreferences,
  workspaceRoot = process.cwd(),
  storageRoot = process.cwd()
}) {
  const database = createDatabase(storageRoot);
  let reader = createSnapshotSourceRouter({
    fiveHourBudget: DEFAULT_PREFERENCES.fiveHourBudget,
    cwd: workspaceRoot,
    baseDir: workspaceRoot
  });
  let dashboard = null;
  let refreshStatus = createRefreshStatus();
  let lastNotifiedState = null;
  let lastForcedRefreshAt = null;

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
      now,
      resetState: refreshStatus.lastSuccessAt
        ? now.getTime() - new Date(refreshStatus.lastSuccessAt).getTime() >= FIVE_HOUR_WINDOW_MS
        : false
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
      pureMenuBarMode: persisted.pureMenuBarMode ?? DEFAULT_PREFERENCES.pureMenuBarMode
    }, getSystemPreferences ? getSystemPreferences() : {});
  }

  function buildDashboard(snapshot, preferences, sourceFile, summary, storedUsageRecords, overrides = {}) {
    const now = new Date();
    const sourceOrigin = overrides.sourceOrigin ?? 'codex_app_server';
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
    const flowAdvice = buildFlowAdvice({
      weeklySummary,
      summary,
      refreshStatus,
      sourceOrigin
    });
    const history = database.getRecentSnapshotsSince(new Date(now.getTime() - FIVE_HOUR_WINDOW_MS).toISOString());
    const trendHistory = history.length > 1 && history.some((entry) => Number.isFinite(entry.remainingPercent))
      ? history
      : buildUsageTrendHistory({
          limit: summary.limit,
          now,
          records: storedUsageRecords,
          windowMs: FIVE_HOUR_WINDOW_MS
        });
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
        file: sourceFile,
        origin: sourceOrigin
      },
      preferences,
      summary,
      weeklySummary,
      prediction,
      flowAdvice,
      refreshInterval,
      history: trendHistory,
      recentRecords: storedUsageRecords.slice(-12).reverse()
    };
  }

  function buildUnavailableDashboard(preferences, sourceFile, overrides = {}) {
    const now = new Date();
    return {
      refreshedAt: now.toISOString(),
      source: {
        label: overrides.sourceLabel ?? 'codex-account-rate-limits',
        file: sourceFile,
        origin: overrides.sourceOrigin ?? 'unknown'
      },
      preferences,
      summary: null,
      weeklySummary: null,
      prediction: null,
      flowAdvice: buildFlowAdvice({
        refreshStatus: createRefreshStatus({
          phase: 'failed',
          dataSource: 'unknown',
          freshness: 'unknown'
        }),
        sourceOrigin: 'unknown'
      }),
      refreshInterval: overrides.refreshInterval ?? LIVE_RATE_LIMIT_REFRESH_FLOOR_MS,
      history: [],
      recentRecords: [],
      isUnavailable: true
    };
  }

  function inferDataSource(currentDashboard) {
    const sourceOrigin = currentDashboard?.source?.origin;
    if (sourceOrigin === 'codex_app_server' || sourceOrigin === 'local_snapshot' || sourceOrigin === 'memory_cache' || sourceOrigin === 'unknown') {
      return sourceOrigin;
    }

    if (currentDashboard?.source?.label === 'local-codex-session-state' || currentDashboard?.source?.label === 'demo-local-snapshot') {
      return 'local_snapshot';
    }

    if (currentDashboard?.summary && currentDashboard?.source?.label === 'codex-account-rate-limits') {
      return 'codex_app_server';
    }

    return 'unknown';
  }

  function publishDashboard(currentDashboard) {
    if (!currentDashboard) {
      return;
    }

    const dataSource = refreshStatus.dataSource === 'unknown'
      ? inferDataSource(currentDashboard)
      : refreshStatus.dataSource;
    const lastSuccessAt = refreshStatus.lastSuccessAt ?? currentDashboard.refreshedAt ?? null;
    let phase = refreshStatus.phase;
    if (refreshStatus.isRetryingAfterWake && phase !== 'refreshing') {
      phase = 'sleep_recovering';
    } else if (phase === 'sleep_recovering' && !refreshStatus.isRetryingAfterWake) {
      phase = dataSource === 'memory_cache' || dataSource === 'local_snapshot'
        ? 'using_snapshot'
        : 'success';
    }

    dashboard = {
      ...currentDashboard,
      source: {
        ...currentDashboard.source,
        origin: currentDashboard.source?.origin ?? dataSource
      },
      refreshStatus: createRefreshStatus({
        ...refreshStatus,
        phase,
        dataSource,
        freshness: computeFreshness({
          lastSuccessAt,
          refreshInterval: currentDashboard.refreshInterval
        }),
        lastSuccessAt
      }),
      isRefreshing: phase === 'refreshing',
      lastSuccessfulRefreshAt: lastSuccessAt,
      lastRefreshStartedAt: refreshStatus.lastAttemptAt,
      lastRefreshError: refreshStatus.failureReason,
      lastForcedRefreshAt,
      isStale: computeIsStale({
        lastSuccessfulRefreshAt: lastSuccessAt,
        refreshInterval: currentDashboard.refreshInterval
      })
    };
    onUpdated(dashboard);
  }

  function maybeNotify(currentDashboard) {
    if (!currentDashboard.summary) {
      lastNotifiedState = null;
      return;
    }

    const weeklyRemainingPercent = currentDashboard.weeklySummary?.remainingPercent
      ?? currentDashboard.summary.remainingPercent;
    const quotaAlertStatus = buildQuotaAlertStatus({
      weeklyRemainingPercent,
      notificationsEnabled: currentDashboard.preferences.notificationsEnabled
    });

    if (!currentDashboard.preferences.notificationsEnabled) {
      lastNotifiedState = null;
      return;
    }

    if (quotaAlertStatus.shouldShowNotification && lastNotifiedState !== quotaAlertStatus.level) {
      onNotify({
        title: 'Codex 周额度很低',
        body: `当前仅剩 ${quotaAlertStatus.weeklyRemainingPercent}% ，建议尽快降频或暂停。`
      });
      lastNotifiedState = quotaAlertStatus.level;
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

    lastNotifiedState = quotaAlertStatus.level;
  }

  async function refreshQuota({
    reason = 'manual',
    force = false,
    isRetryingAfterWake = false,
    retryAttempt = null
  } = {}) {
    const startedAt = new Date().toISOString();
    const previousForcedRefreshAt = lastForcedRefreshAt;

    if (refreshStatus.phase === 'refreshing') {
      logger.debug({
        reason,
        force,
        cause: 'in-flight'
      }, 'refresh skipped');
      if (dashboard) {
        refreshStatus = createRefreshStatus({
          ...refreshStatus,
          lastAttemptAt: startedAt
        });
        publishDashboard(dashboard);
      }
      return dashboard;
    }

    const shouldDedupForcedRefresh = force && reason !== 'manual';

    if (shouldDedupForcedRefresh && previousForcedRefreshAt) {
      const elapsedMs = Date.now() - new Date(previousForcedRefreshAt).getTime();
      if (elapsedMs < FORCE_DEDUPE_MS && dashboard) {
        logger.debug({
          reason,
          force,
          cause: 'forced-deduped',
          elapsedMs
        }, 'refresh skipped');
        if (dashboard) {
          refreshStatus = createRefreshStatus({
            ...refreshStatus,
            lastAttemptAt: startedAt
          });
          publishDashboard(dashboard);
        }
        return dashboard;
      }
    }

    refreshStatus = createRefreshStatus({
      ...refreshStatus,
      phase: 'refreshing',
      lastAttemptAt: startedAt,
      failureReason: null,
      isRetryingAfterWake: refreshStatus.isRetryingAfterWake || isRetryingAfterWake || reason === 'resume' || reason === 'unlock',
      retryAttempt: retryAttempt ?? refreshStatus.retryAttempt
    });

    if (force) {
      lastForcedRefreshAt = startedAt;
    }

    if (dashboard) {
      publishDashboard(dashboard);
    }

    logger.debug({
      reason,
      force
    }, 'refresh start');

    const persistedPreferences = database.getPreferences();
    const now = new Date();
    let refreshError = null;

    try {
      let refreshSource = 'codex_app_server';
      let refreshAt = now.toISOString();

      try {
        const liveRateLimits = await readLiveRateLimits({ cwd: workspaceRoot });
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
            refreshInterval: liveRefreshInterval,
            sourceOrigin: 'codex_app_server'
          }
        );
        refreshSource = 'codex_app_server';
        refreshAt = dashboard.refreshedAt;
        refreshStatus = createRefreshStatus({
          ...refreshStatus,
          phase: 'success',
          dataSource: refreshSource,
          lastSuccessAt: refreshAt,
          lastFailureAt: refreshError ? now.toISOString() : refreshStatus.lastFailureAt,
          failureReason: refreshError
        });
      } catch (error) {
        refreshError = error?.message ?? String(error);
        logger.info({
          error: refreshError
        }, 'live rate-limit read failed, falling back to cached dashboard or local snapshot data');

        const snapshotResult = await reader.readSnapshot();
        if (snapshotResult?.snapshot?.records?.length) {
          const snapshot = snapshotResult.snapshot;
          const preferences = mergePreferences(snapshot, persistedPreferences);
          const storedUsageRecords = materializeUsageRecords(snapshot, now);
          const summary = summarizeUsage({
            limit: preferences.fiveHourBudget ?? snapshot.limit ?? DEFAULT_PREFERENCES.fiveHourBudget,
            now,
            records: storedUsageRecords
          });
          dashboard = buildDashboard(
            snapshot,
            preferences,
            snapshotResult.sourceFile,
            summary,
            storedUsageRecords,
            {
              sourceLabel: snapshot.sourceLabel,
              sourceOrigin: 'local_snapshot',
              refreshInterval: getRefreshInterval({
                isActive: preferences.isActive,
                isHighIntensity: preferences.isHighIntensity,
                remainingPercent: summary.remainingPercent
              }),
              weeklySummary: summarizeUsage({
                limit: preferences.weeklyBudget ?? (preferences.fiveHourBudget * 7),
                now,
                records: storedUsageRecords,
                windowMs: SEVEN_DAYS_MS
              })
            }
          );
          refreshSource = 'local_snapshot';
          refreshAt = dashboard.refreshedAt;
          refreshStatus = createRefreshStatus({
            ...refreshStatus,
            phase: 'using_snapshot',
            dataSource: refreshSource,
            lastSuccessAt: refreshAt,
            lastFailureAt: now.toISOString(),
            failureReason: refreshError
          });
          logger.info({
            sourceLabel: snapshot.sourceLabel ?? 'unknown'
          }, 'using local snapshot after live refresh failure');
        } else {
          const cachedDashboard = readDashboardArtifact(storageRoot);
          if (cachedDashboard?.summary) {
            dashboard = {
              ...cachedDashboard,
              source: {
                ...cachedDashboard.source,
                origin: 'memory_cache'
              }
            };
            refreshSource = 'memory_cache';
            refreshAt = cachedDashboard.refreshedAt ?? now.toISOString();
            refreshStatus = createRefreshStatus({
              ...refreshStatus,
              phase: 'using_snapshot',
              dataSource: refreshSource,
              lastSuccessAt: refreshAt,
              lastFailureAt: now.toISOString(),
              failureReason: refreshError
            });
            logger.info({
              sourceLabel: cachedDashboard.source?.label ?? 'unknown'
            }, 'using cached dashboard after live refresh failure');
          } else {
            const preferences = mergePreferences({
              sourceLabel: 'codex-account-rate-limits',
              limit: DEFAULT_PREFERENCES.fiveHourBudget,
              isActive: true
            }, persistedPreferences);
            dashboard = buildUnavailableDashboard(preferences, 'codex app-server account/rateLimits/read');
            refreshSource = 'unknown';
            refreshAt = now.toISOString();
            refreshStatus = createRefreshStatus({
              ...refreshStatus,
              phase: 'failed',
              dataSource: refreshSource,
              lastFailureAt: refreshAt,
              failureReason: refreshError ?? 'dashboard refresh failed'
            });
          }
        }
      }

      if (!dashboard) {
        throw new Error(refreshError ?? 'dashboard refresh failed');
      }

      dashboard = {
        ...dashboard,
        source: {
          ...dashboard.source,
          origin: dashboard.source?.origin ?? refreshSource
        }
      };
      if (dashboard.summary) {
        writeDashboardArtifact(dashboard, storageRoot);
      }
      maybeNotify(dashboard);
      publishDashboard(dashboard);
      logger.debug({
        reason,
        force,
        remainingPercent: dashboard.summary?.remainingPercent ?? null,
        sourceLabel: dashboard.source.label
      }, 'refresh success');
      return dashboard;
    } catch (error) {
      const errorMessage = error?.message ?? String(error);
      refreshStatus = createRefreshStatus({
        ...refreshStatus,
        phase: dashboard?.summary ? 'using_snapshot' : 'failed',
        lastFailureAt: new Date().toISOString(),
        failureReason: errorMessage
      });
      if (dashboard) {
        dashboard = {
          ...dashboard,
          source: {
            ...dashboard.source,
            origin: dashboard.source?.origin ?? inferDataSource(dashboard)
          }
        };
        if (dashboard.summary) {
          writeDashboardArtifact(dashboard, storageRoot);
        }
        publishDashboard(dashboard);
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
    setRefreshContext(patch = {}) {
      const nextPatch = {
        ...patch
      };

      if (nextPatch.isRetryingAfterWake && !nextPatch.phase) {
        nextPatch.phase = 'sleep_recovering';
      }

      refreshStatus = createRefreshStatus({
        ...refreshStatus,
        ...nextPatch
      });
      if (dashboard) {
        publishDashboard(dashboard);
      }
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
      database.close();
    }
  };
}
