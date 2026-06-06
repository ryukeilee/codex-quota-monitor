import { formatUsageDetail } from '../utils/format-usage.js';

function formatTime(value) {
  if (!value) {
    return '暂无';
  }

  return new Date(value).toLocaleString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatRefreshLabel(intervalMs) {
  if (intervalMs < 60 * 1000) {
    return `${Math.round(intervalMs / 1000)} 秒`;
  }

  return `${Math.round(intervalMs / (60 * 1000))} 分钟`;
}

const elements = {
  remainingPercent: document.getElementById('mini-remaining-percent'),
  windowState: document.getElementById('mini-window-state'),
  used: document.getElementById('mini-used'),
  weekly: document.getElementById('mini-weekly'),
  recovery: document.getElementById('mini-recovery'),
  flow: document.getElementById('mini-flow'),
  refresh: document.getElementById('mini-refresh'),
  meta: document.getElementById('mini-meta'),
  recommendation: document.getElementById('mini-recommendation')
};

function renderDashboard(dashboard) {
  elements.remainingPercent.textContent = `${dashboard.summary.remainingPercent}%`;
  elements.windowState.textContent = dashboard.summary.windowState === 'near_limit' ? '接近额度墙' : '状态健康';
  elements.used.textContent = formatUsageDetail(dashboard.summary);
  elements.weekly.textContent = dashboard.weeklySummary
    ? `${dashboard.weeklySummary.remainingPercent}%`
    : '--';
  elements.recovery.textContent = formatTime(dashboard.summary.nextRecoveryAt);
  elements.flow.textContent = Number.isFinite(dashboard.prediction.hoursRemaining)
    ? `${dashboard.prediction.hoursRemaining} 小时`
    : '充足';
  elements.refresh.textContent = formatRefreshLabel(dashboard.refreshInterval);
  elements.meta.textContent = `${dashboard.source.label} · 最近刷新 ${new Date(dashboard.refreshedAt).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })}`;
  elements.recommendation.textContent = dashboard.prediction.recommendation;
}

window.codexMonitor.onDashboardUpdated((dashboard) => {
  renderDashboard(dashboard);
});

const initialDashboard = await window.codexMonitor.loadDashboard();
renderDashboard(initialDashboard);
