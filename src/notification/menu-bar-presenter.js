import { formatUsageDetail } from '../utils/format-usage.js';

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

function formatTrayTitle(summary, weeklySummary, preferences) {
  if (!preferences.showPercentageInMenuBar) {
    return '';
  }

  const titleSummary = weeklySummary ?? summary;
  return `${titleSummary.remainingPercent}%`;
}

export function formatRefreshLabel(intervalMs) {
  if (intervalMs < 60 * 1000) {
    return `下次刷新约 ${Math.round(intervalMs / 1000)} 秒后`;
  }

  return `下次刷新约 ${Math.round(intervalMs / (60 * 1000))} 分钟后`;
}

export function buildMenuBarState(dashboard) {
  const windowRemainingPercent = dashboard.summary.remainingPercent;
  const weeklyRemainingPercent = dashboard.weeklySummary
    ? `${dashboard.weeklySummary.remainingPercent}%`
    : `${windowRemainingPercent}%`;
  const weeklyResetAt = dashboard.weeklySummary?.nextRecoveryAt ?? null;

  return {
    title: formatTrayTitle(dashboard.summary, dashboard.weeklySummary, dashboard.preferences),
    toolTip: `Codex Monitor：周额度剩余 ${weeklyRemainingPercent}`,
    lines: {
      weeklyLabel: `周额度 ${weeklyRemainingPercent} 剩余`,
      weeklyResetLabel: `重置于 ${formatShortDate(weeklyResetAt)}`,
      windowLabel: `5 小时窗口 ${formatUsageDetail(dashboard.summary)} 剩余`,
      recoveryLabel: `5 小时恢复 ${formatDateTime(dashboard.summary.nextRecoveryAt)}`,
      lastRefreshLabel: `最近刷新 ${formatClockTime(dashboard.refreshedAt)}`,
      refreshLabel: formatRefreshLabel(dashboard.refreshInterval)
    }
  };
}
