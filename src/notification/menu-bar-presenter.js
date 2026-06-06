import { formatUsageDetail } from '../utils/format-usage.js';

function formatTime(value) {
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

function formatWindowState(windowState) {
  return windowState === 'near_limit' ? '接近额度墙' : '状态健康';
}

function formatTrayTitle(summary, preferences) {
  if (!preferences.showPercentageInMenuBar) {
    return '';
  }

  const baseTitle = `${summary.remainingPercent}%`;
  if (summary.windowState !== 'near_limit') {
    return baseTitle;
  }

  return `⚠ ${baseTitle}`;
}

export function formatRefreshLabel(intervalMs) {
  if (intervalMs < 60 * 1000) {
    return `下次刷新约 ${Math.round(intervalMs / 1000)} 秒后`;
  }

  return `下次刷新约 ${Math.round(intervalMs / (60 * 1000))} 分钟后`;
}

export function buildMenuBarState(dashboard) {
  const remainingPercent = dashboard.summary.remainingPercent;
  const hoursRemaining = Number.isFinite(dashboard.prediction.hoursRemaining)
    ? `${dashboard.prediction.hoursRemaining} 小时`
    : '充足';

  return {
    title: formatTrayTitle(dashboard.summary, dashboard.preferences),
    toolTip: `Codex Monitor: 5 小时剩余 ${remainingPercent}%`,
    lines: {
      remainingLabel: `剩余 ${remainingPercent}%`,
      windowLabel: `5 小时窗口 ${formatUsageDetail(dashboard.summary)}`,
      statusLabel: `状态: ${formatWindowState(dashboard.summary.windowState)}`,
      predictionLabel: `预计还能开发 ${hoursRemaining}`,
      recoveryLabel: `预计恢复 ${formatTime(dashboard.summary.nextRecoveryAt)}`,
      recommendationLabel: dashboard.prediction.recommendation,
      refreshLabel: formatRefreshLabel(dashboard.refreshInterval)
    }
  };
}
