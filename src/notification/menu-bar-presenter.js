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
    return 'TBD';
  }

  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
}

function formatClockTime(value) {
  if (!value) {
    return '暂无';
  }

  return new Date(value).toLocaleTimeString('en-US', {
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
    toolTip: `Codex Monitor: Weekly ${weeklyRemainingPercent} remaining`,
    lines: {
      weeklyLabel: `Weekly Quota ${weeklyRemainingPercent} remaining`,
      weeklyResetLabel: `Resets ${formatShortDate(weeklyResetAt)}`,
      windowLabel: `5h Window ${formatUsageDetail(dashboard.summary)} remaining`,
      recoveryLabel: `5h Recovery ${formatDateTime(dashboard.summary.nextRecoveryAt)}`,
      lastRefreshLabel: `Last Refresh ${formatClockTime(dashboard.refreshedAt)}`,
      refreshLabel: formatRefreshLabel(dashboard.refreshInterval)
    }
  };
}
