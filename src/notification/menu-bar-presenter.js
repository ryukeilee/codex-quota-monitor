import { formatUsageDetail } from '../utils/format-usage.js';
import { buildQuotaAlertStatus } from '../core/quota-alert.js';
import {
  createRefreshStatus,
  formatRefreshStatus,
  formatDataSource,
  formatFreshness,
  computeFreshness
} from '../core/refresh-status.js';

function formatDateTime(value) {
  if (!value) {
    return '暂无';
  }

  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatShortDate(value) {
  if (!value) {
    return '暂无';
  }

  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatClockTime(value) {
  if (!value) {
    return '暂无';
  }

  return new Date(value).toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function truncateLabel(value, maxLength = 18) {
  if (!value) {
    return '暂无';
  }

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

function formatDevelopmentState(preferences) {
  if (!preferences?.isActive) {
    return '已暂停';
  }

  return preferences.isHighIntensity ? '开发中 · 高强度' : '开发中 · 轻强度';
}

function formatPredictionState(prediction) {
  if (!prediction) {
    return '暂无';
  }

  if (prediction.recommendedIntensity === 'low') {
    return '建议降速';
  }

  if (prediction.recommendedIntensity === 'current') {
    return '保持当前节奏';
  }

  return '暂无';
}

function formatFlowAdviceState(flowAdvice, prediction) {
  if (flowAdvice?.title) {
    return flowAdvice.title;
  }

  return formatPredictionState(prediction);
}

function formatQuotaAlertLevel(level) {
  if (level === 'watch') {
    return '观察';
  }

  if (level === 'warning') {
    return '警戒';
  }

  if (level === 'critical') {
    return '危险';
  }

  return '正常';
}

function formatQuotaAlertLabel(quotaAlertStatus) {
  if (!quotaAlertStatus.shouldShowInMenu) {
    return '暂无';
  }

  return `${formatQuotaAlertLevel(quotaAlertStatus.level)} · ${quotaAlertStatus.message}`;
}

function formatTrayTitle(summary, weeklySummary, preferences) {
  if (!preferences.showPercentageInMenuBar) {
    return '';
  }

  if (!summary && !weeklySummary) {
    return '--';
  }

  const titleSummary = weeklySummary ?? summary;
  if (!titleSummary) {
    return '--';
  }

  return `${titleSummary.remainingPercent}%`;
}

function formatTimeLabel(value) {
  return value ? formatClockTime(value) : '暂无';
}

export function formatRefreshLabel(intervalMs) {
  if (intervalMs < 60 * 1000) {
    return `下次刷新约 ${Math.round(intervalMs / 1000)} 秒后`;
  }

  return `下次刷新约 ${Math.round(intervalMs / (60 * 1000))} 分钟后`;
}

export function buildMenuBarState(dashboard) {
  const sourceData = dashboard.refreshStatus?.dataSource
    ?? dashboard.source?.origin
    ?? (dashboard.source?.label === 'local-codex-session-state' ? 'local_snapshot' : (dashboard.summary ? 'codex_app_server' : 'unknown'));
  const lastSuccessAt = dashboard.refreshStatus?.lastSuccessAt
    ?? dashboard.lastSuccessfulRefreshAt
    ?? dashboard.refreshedAt
    ?? null;
  const phase = dashboard.refreshStatus?.phase
    ?? (dashboard.summary
      ? (sourceData === 'local_snapshot' || sourceData === 'memory_cache' ? 'using_snapshot' : 'success')
      : 'failed');
  const refreshStatus = createRefreshStatus({
    ...dashboard.refreshStatus,
    phase,
    dataSource: sourceData,
    lastSuccessAt,
    freshness: dashboard.refreshStatus?.freshness
      ?? computeFreshness({
        lastSuccessAt,
        refreshInterval: dashboard.refreshInterval
      })
  });
  const refreshLabels = formatRefreshStatus(refreshStatus);
  const windowRemainingPercent = dashboard.summary
    ? `${dashboard.summary.remainingPercent}%`
    : '暂无';
  const weeklyRemainingPercent = dashboard.weeklySummary
    ? `${dashboard.weeklySummary.remainingPercent}%`
    : (dashboard.summary ? `${dashboard.summary.remainingPercent}%` : '暂无');
  const weeklyResetAt = dashboard.weeklySummary?.nextRecoveryAt ?? null;
  const quotaAlertStatus = buildQuotaAlertStatus({
    weeklyRemainingPercent: dashboard.weeklySummary?.remainingPercent ?? dashboard.summary?.remainingPercent,
    notificationsEnabled: dashboard.preferences.notificationsEnabled
  });
  const quotaAlertTooltipLabel = quotaAlertStatus.shouldShowInMenu
    ? formatQuotaAlertLevel(quotaAlertStatus.level)
    : '暂无';

  return {
    title: formatTrayTitle(dashboard.summary, dashboard.weeklySummary, dashboard.preferences),
    toolTip: `Codex Monitor：周额度剩余 ${weeklyRemainingPercent} · ${quotaAlertTooltipLabel} · ${refreshLabels.phaseLabel} · ${refreshLabels.dataSourceLabel}`,
    lines: {
      statusLabel: `刷新状态 ${refreshLabels.phaseLabel} · ${refreshLabels.dataSourceLabel} · ${refreshLabels.freshnessLabel}`,
      sourceLabel: `当前数据 ${formatDataSource(refreshStatus.dataSource)}`,
      freshnessLabel: `新鲜度 ${formatFreshness(refreshStatus.freshness)}`,
      weeklyLabel: `周额度 ${weeklyRemainingPercent} 剩余`,
      weeklyStatusLabel: `额度状态 ${formatQuotaAlertLabel(quotaAlertStatus)}`,
      weeklyResetLabel: `重置于 ${formatShortDate(weeklyResetAt)}`,
      windowLabel: `5 小时窗口 ${formatUsageDetail(dashboard.summary)} 剩余`,
      recoveryLabel: `5 小时恢复 ${formatDateTime(dashboard.summary?.nextRecoveryAt)}`,
      predictionLabel: `开发心流建议 ${formatFlowAdviceState(dashboard.flowAdvice, dashboard.prediction)}`,
      developmentLabel: `开发状态 ${formatDevelopmentState(dashboard.preferences)}`,
      lastRefreshLabel: `最近尝试 ${formatTimeLabel(refreshStatus.lastAttemptAt ?? dashboard.lastRefreshStartedAt ?? dashboard.refreshedAt)}`,
      lastSuccessLabel: `最近成功 ${formatTimeLabel(refreshStatus.lastSuccessAt ?? dashboard.lastSuccessfulRefreshAt ?? dashboard.refreshedAt)}`,
      lastFailureLabel: `最近失败 ${formatTimeLabel(refreshStatus.lastFailureAt)}`,
      wakeLabel: refreshStatus.isRetryingAfterWake
        ? `唤醒恢复 第 ${refreshStatus.retryAttempt ?? 1} 次`
        : '唤醒恢复 否',
      nextRefreshLabel: `下次刷新 ${formatTimeLabel(refreshStatus.nextScheduledRefreshAt)}`,
      failureReasonLabel: refreshStatus.failureReason
        ? `失败原因 ${truncateLabel(refreshStatus.failureReason, 22)}`
        : '失败原因 暂无',
      refreshLabel: formatRefreshLabel(dashboard.refreshInterval)
    }
  };
}
