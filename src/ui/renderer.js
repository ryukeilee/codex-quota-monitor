import { formatUsageDetail } from '../utils/format-usage.js';
import {
  createRefreshStatus,
  formatRefreshStatus,
  computeFreshness
} from '../core/refresh-status.js';

let echarts = null;
try {
  echarts = await import('../../node_modules/echarts/dist/echarts.esm.min.mjs');
} catch (error) {
  console.warn('ECharts unavailable, skipping history chart', error);
}

const chartElement = document.getElementById('history-chart');
const chart = echarts && chartElement ? echarts.init(chartElement) : null;

const elements = {
  refreshButton: document.getElementById('refresh-button'),
  refreshStatus: document.getElementById('refresh-status'),
  refreshMeta: document.getElementById('refresh-meta'),
  remainingPercent: document.getElementById('remaining-percent'),
  remainingDetail: document.getElementById('remaining-detail'),
  remainingPercentInline: document.getElementById('remaining-percent-inline'),
  weeklyPercent: document.getElementById('weekly-percent'),
  weeklyDetail: document.getElementById('weekly-detail'),
  weeklyPercentInline: document.getElementById('weekly-percent-inline'),
  windowState: document.getElementById('window-state'),
  windowDetail: document.getElementById('window-detail'),
  windowStateInline: document.getElementById('window-state-inline'),
  recoveryTime: document.getElementById('recovery-time'),
  recoveryDetail: document.getElementById('recovery-detail'),
  recoveryTimeInline: document.getElementById('recovery-time-inline'),
  developmentState: document.getElementById('development-state'),
  developmentDetail: document.getElementById('development-detail'),
  developmentStateInline: document.getElementById('development-state-inline'),
  liveSourceLabel: document.getElementById('live-source-label'),
  liveSourceLabelTop: document.getElementById('live-source-label-top'),
  flowHours: document.getElementById('flow-hours'),
  flowDetail: document.getElementById('flow-detail'),
  trendSourceLabel: document.getElementById('trend-source-label'),
  recommendationText: document.getElementById('recommendation-text'),
  recordList: document.getElementById('record-list'),
  preferencesForm: document.getElementById('preferences-form'),
  isActive: document.getElementById('is-active'),
  showPercentageInMenuBar: document.getElementById('show-percentage-in-menu-bar'),
  closeToMenuBar: document.getElementById('close-to-menu-bar'),
  notificationsEnabled: document.getElementById('notifications-enabled'),
  autoLaunchEnabled: document.getElementById('auto-launch-enabled'),
  pureMenuBarMode: document.getElementById('pure-menu-bar-mode')
};

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

function formatStatusLine(dashboard) {
  const sourceData = dashboard?.refreshStatus?.dataSource
    ?? dashboard?.source?.origin
    ?? (dashboard?.summary ? 'codex_app_server' : 'unknown');
  const lastSuccessAt = dashboard?.refreshStatus?.lastSuccessAt
    ?? dashboard?.lastSuccessfulRefreshAt
    ?? dashboard?.refreshedAt
    ?? null;
  const phase = dashboard?.refreshStatus?.phase
    ?? (dashboard?.summary
      ? (sourceData === 'local_snapshot' || sourceData === 'memory_cache' ? 'using_snapshot' : 'success')
      : 'failed');
  const refreshStatus = createRefreshStatus({
    ...dashboard?.refreshStatus,
    phase,
    dataSource: sourceData,
    lastSuccessAt,
    freshness: dashboard?.refreshStatus?.freshness
      ?? computeFreshness({
        lastSuccessAt,
        refreshInterval: dashboard?.refreshInterval
      })
  });
  const labels = formatRefreshStatus(refreshStatus);

  return `${labels.phaseLabel} · ${labels.dataSourceLabel} · ${labels.freshnessLabel}`;
}

function formatMetaLine(dashboard) {
  const refreshStatus = createRefreshStatus(dashboard?.refreshStatus);
  const attemptAt = formatTime(refreshStatus.lastAttemptAt ?? dashboard?.lastRefreshStartedAt ?? dashboard?.refreshedAt);
  const successAt = formatTime(refreshStatus.lastSuccessAt ?? dashboard?.lastSuccessfulRefreshAt ?? dashboard?.refreshedAt);
  const nextRefreshAt = formatTime(refreshStatus.nextScheduledRefreshAt);
  return `尝试 ${attemptAt} · 成功 ${successAt} · 下次 ${nextRefreshAt}`;
}

function formatFailureLine(dashboard) {
  const failureReason = dashboard?.refreshStatus?.failureReason;
  if (!failureReason) {
    return null;
  }

  return `刷新失败 · ${failureReason}`;
}

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

function formatDevelopmentState(preferences) {
  if (!preferences?.isActive) {
    return '已暂停';
  }

  return preferences.isHighIntensity ? '开发中 · 高强度' : '开发中 · 轻强度';
}

function formatRecommendedIntensity(value) {
  if (value === 'low') {
    return '建议降速';
  }

  if (value === 'current') {
    return '保持当前节奏';
  }

  return '暂无';
}

function formatTokenCount(value) {
  return Number(value).toLocaleString('zh-CN');
}

function renderHistory(history) {
  if (!chart) {
    return;
  }

  chart.setOption({
    animation: false,
    grid: {
      top: 24,
      left: 48,
      right: 24,
      bottom: 36
    },
    tooltip: {
      trigger: 'axis'
    },
    xAxis: {
      type: 'category',
      data: history.map((item) => formatTime(item.capturedAt)),
      axisLine: {
        lineStyle: {
          color: '#c8b9ad'
        }
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLabel: {
        formatter: '{value}%'
      }
    },
    series: [
      {
        name: '5 小时剩余',
        type: 'line',
        smooth: true,
        data: history.map((item) => item.remainingPercent),
        lineStyle: {
          color: '#b65d3a',
          width: 3
        },
        itemStyle: {
          color: '#b65d3a'
        },
        areaStyle: {
          color: 'rgba(182, 93, 58, 0.12)'
        }
      }
    ]
  });
}

function renderRecords(records) {
  elements.recordList.innerHTML = records.map((record) => `
    <article class="record-item">
      <div>
        <div class="record-amount">消耗 ${formatTokenCount(record.amount)} tokens</div>
        <div class="record-meta">${record.model} / ${record.intensity}</div>
      </div>
      <div class="record-meta">${formatTime(record.at)}</div>
    </article>
  `).join('');
}

function renderDashboard(dashboard) {
  if (!dashboard) {
    return;
  }

  if (!dashboard.summary) {
    const failureLine = formatFailureLine(dashboard);
    elements.remainingPercent.textContent = '--';
    elements.remainingDetail.textContent = '暂无可用的实时额度数据';
    elements.remainingPercentInline.textContent = '--';
    elements.weeklyPercent.textContent = '--';
    elements.weeklyDetail.textContent = '暂无可用的实时额度数据';
    elements.weeklyPercentInline.textContent = '--';
    elements.windowState.textContent = '暂无';
    elements.windowDetail.textContent = '暂无可用的实时额度数据';
    elements.windowStateInline.textContent = '暂无';
    elements.recoveryTime.textContent = '--';
    elements.recoveryDetail.textContent = '暂无可用的实时额度数据';
    elements.recoveryTimeInline.textContent = '--';
    elements.developmentState.textContent = formatDevelopmentState(dashboard.preferences);
    elements.developmentDetail.textContent = '实时额度读取失败，仅保留本地状态。';
    elements.developmentStateInline.textContent = formatDevelopmentState(dashboard.preferences);
    elements.refreshStatus.textContent = `${formatStatusLine(dashboard)}${failureLine ? ` · ${failureLine}` : ''}`;
    elements.liveSourceLabel.textContent = dashboard.source.label;
    elements.liveSourceLabelTop.textContent = dashboard.source.label;
    elements.flowHours.textContent = '暂无';
    elements.flowDetail.textContent = '额度读取失败';
    elements.refreshMeta.textContent = formatMetaLine(dashboard);
    elements.trendSourceLabel.textContent = `数据源：${dashboard.source.label}`;
    elements.recommendationText.textContent = '读取失败，请稍后重试。';
    elements.isActive.checked = dashboard.preferences.isActive;
    elements.showPercentageInMenuBar.checked = dashboard.preferences.showPercentageInMenuBar;
    elements.closeToMenuBar.checked = dashboard.preferences.closeToMenuBar;
    elements.notificationsEnabled.checked = dashboard.preferences.notificationsEnabled;
    elements.autoLaunchEnabled.checked = dashboard.preferences.autoLaunchEnabled;
    elements.pureMenuBarMode.checked = dashboard.preferences.pureMenuBarMode;
    renderHistory([]);
    renderRecords([]);
    return;
  }

  elements.remainingPercent.textContent = `${dashboard.summary.remainingPercent}%`;
  elements.remainingDetail.textContent = `当前窗口 ${formatUsageDetail(dashboard.summary)}`;
  elements.remainingPercentInline.textContent = `${dashboard.summary.remainingPercent}%`;
  elements.weeklyPercent.textContent = dashboard.weeklySummary
    ? `${dashboard.weeklySummary.remainingPercent}%`
    : '--';
  elements.weeklyDetail.textContent = dashboard.weeklySummary
    ? `近 7 天 ${formatUsageDetail(dashboard.weeklySummary)} · 重置于 ${formatDateTime(dashboard.weeklySummary.nextRecoveryAt)}`
    : '暂无周数据';
  elements.weeklyPercentInline.textContent = dashboard.weeklySummary
    ? `${dashboard.weeklySummary.remainingPercent}%`
    : '--';
  elements.windowState.textContent = dashboard.summary.windowState === 'near_limit' ? '接近额度墙' : '状态健康';
  elements.windowDetail.textContent = `${dashboard.summary.windowUsageCount} 条窗口内记录`;
  elements.windowStateInline.textContent = dashboard.summary.windowState === 'near_limit' ? '接近额度墙' : '状态健康';
  elements.recoveryTime.textContent = formatTime(dashboard.summary.nextRecoveryAt);
  elements.recoveryDetail.textContent = dashboard.summary.nextRecoveryAt
    ? '按照最早一笔窗口内消耗估算'
    : '暂无待恢复记录';
  elements.recoveryTimeInline.textContent = formatTime(dashboard.summary.nextRecoveryAt);
  elements.developmentState.textContent = formatDevelopmentState(dashboard.preferences);
  elements.developmentDetail.textContent = dashboard.preferences.isActive
    ? (dashboard.preferences.isHighIntensity ? '当前按高强度开发节奏运行' : '当前按常规开发节奏运行')
    : '当前处于暂停状态';
  elements.developmentStateInline.textContent = formatDevelopmentState(dashboard.preferences);
  elements.refreshStatus.textContent = formatStatusLine(dashboard);
  elements.liveSourceLabel.textContent = dashboard.source.label;
  elements.liveSourceLabelTop.textContent = dashboard.source.label;
  elements.flowHours.textContent = Number.isFinite(dashboard.prediction.hoursRemaining)
    ? `${dashboard.prediction.hoursRemaining} 小时`
    : '充足';
  elements.flowDetail.textContent = formatRecommendedIntensity(dashboard.prediction.recommendedIntensity);
  elements.refreshMeta.textContent = formatMetaLine(dashboard);
  elements.trendSourceLabel.textContent = `数据源：${dashboard.source.label}`;
  elements.recommendationText.textContent = dashboard.prediction.recommendation;
  elements.isActive.checked = dashboard.preferences.isActive;
  elements.showPercentageInMenuBar.checked = dashboard.preferences.showPercentageInMenuBar;
  elements.closeToMenuBar.checked = dashboard.preferences.closeToMenuBar;
  elements.notificationsEnabled.checked = dashboard.preferences.notificationsEnabled;
  elements.autoLaunchEnabled.checked = dashboard.preferences.autoLaunchEnabled;
  elements.pureMenuBarMode.checked = dashboard.preferences.pureMenuBarMode;

  renderHistory(dashboard.history);
  renderRecords(dashboard.recentRecords);
}

elements.refreshButton.addEventListener('click', async () => {
  const dashboard = await window.codexMonitor.refreshQuota({
    reason: 'manual',
    force: true
  });
  renderDashboard(dashboard);
});

elements.preferencesForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const dashboard = await window.codexMonitor.updatePreferences({
    isActive: elements.isActive.checked,
    showPercentageInMenuBar: elements.showPercentageInMenuBar.checked,
    closeToMenuBar: elements.closeToMenuBar.checked,
    notificationsEnabled: elements.notificationsEnabled.checked,
    autoLaunchEnabled: elements.autoLaunchEnabled.checked,
    pureMenuBarMode: elements.pureMenuBarMode.checked
  });
  renderDashboard(dashboard);
});

window.codexMonitor.onDashboardUpdated((dashboard) => {
  try {
    renderDashboard(dashboard);
  } catch (error) {
    console.error('renderDashboard failed', error);
  }
});

const initialDashboard = await window.codexMonitor.loadDashboard().catch(() => null);
const dashboardToRender = initialDashboard ?? await window.codexMonitor.refreshQuota({
  reason: 'panel-open',
  force: true
}).catch(() => null);
if (dashboardToRender) {
  try {
    renderDashboard(dashboardToRender);
  } catch (error) {
    console.error('initial render failed', error);
  }
}

window.addEventListener('resize', () => {
  if (chart) {
    chart.resize();
  }
});
