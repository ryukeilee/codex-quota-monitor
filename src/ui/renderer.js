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
  flowHours: document.getElementById('flow-hours'),
  flowDetail: document.getElementById('flow-detail'),
  burnRateTitle: document.getElementById('burn-rate-title'),
  burnRateDetail: document.getElementById('burn-rate-detail'),
  burnRateLevelInline: document.getElementById('burn-rate-level-inline'),
  burnRateHoursInline: document.getElementById('burn-rate-hours-inline'),
  burnRateIntensityInline: document.getElementById('burn-rate-intensity-inline'),
  burnRateMessage: document.getElementById('burn-rate-message'),
  burnRateMeta: document.getElementById('burn-rate-meta'),
  flowAdviceTitle: document.getElementById('flow-advice-title'),
  flowAdviceState: document.getElementById('flow-advice-state'),
  flowAdviceMeta: document.getElementById('flow-advice-meta'),
  flowAdviceRecommended: document.getElementById('flow-advice-recommended'),
  flowAdviceAvoid: document.getElementById('flow-advice-avoid'),
  flowAdviceBox: document.getElementById('flow-advice-box'),
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

function setRefreshButtonState(isRefreshing) {
  if (!elements.refreshButton) {
    return;
  }

  elements.refreshButton.disabled = isRefreshing;
  elements.refreshButton.textContent = isRefreshing ? '刷新中…' : '立即刷新';
}

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

function formatTokenCount(value) {
  return Number(value).toLocaleString('zh-CN');
}

function formatAdviceMeta(advice) {
  if (!advice) {
    return '暂无';
  }

  return advice.basedOnStaleData ? '基于偏旧数据' : '基于实时数据';
}

function formatAdviceState(advice) {
  if (!advice) {
    return '暂无建议';
  }

  const levelLabelMap = {
    good: '适合开大任务',
    light: '适合小步推进',
    careful: '先控范围',
    review_only: '只做 Review / 收尾',
    unknown: '先等数据'
  };

  return `${levelLabelMap[advice.level] ?? advice.title} · ${formatAdviceMeta(advice)}`;
}

function formatBurnRateIntensity(result) {
  if (!result) {
    return '先观察';
  }

  if (result.recommendedIntensity === 'lower') {
    return '建议降强度';
  }

  if (result.recommendedIntensity === 'current') {
    return '保持当前';
  }

  return '先观察';
}

function formatBurnRateMeta(result) {
  if (!result || !result.basedOnHours) {
    return '基于本地快照持续观察';
  }

  const weeklyRate = Number.isFinite(result.weeklyBurnRatePerHour)
    ? `周 ${result.weeklyBurnRatePerHour.toFixed(1)}%/h`
    : '周 暂无';
  const windowRate = Number.isFinite(result.window5hBurnRatePerHour)
    ? `5小时 ${result.window5hBurnRatePerHour.toFixed(1)}%/h`
    : '5小时 暂无';

  return `基于近 ${Math.round(result.basedOnHours)} 小时快照 · ${weeklyRate} · ${windowRate}`;
}

function renderBurnRate(result) {
  const title = result?.title ?? '先继续观察';
  const detail = result?.estimatedTimeRemaining
    ? `按当前速度约还能开发 ${result.estimatedTimeRemaining}`
    : '本地快照还不够，暂时无法判断';

  elements.burnRateTitle.textContent = title;
  elements.burnRateDetail.textContent = detail;
  elements.burnRateLevelInline.textContent = title;
  elements.burnRateHoursInline.textContent = result?.estimatedTimeRemaining ?? '暂无';
  elements.burnRateIntensityInline.textContent = formatBurnRateIntensity(result);
  elements.burnRateMessage.textContent = result?.message ?? '本地快照还不够，暂时无法判断消耗速度。';
  elements.burnRateMeta.textContent = formatBurnRateMeta(result);
}

function renderAdviceChips(container, values) {
  if (!container) {
    return;
  }

  container.innerHTML = (values ?? []).map((value) => `<span class="advice-chip">${value}</span>`).join('');
}

function renderHistory(history) {
  if (!chart) {
    return;
  }

  const compactHistory = (history ?? []).slice(-6);

  chart.setOption({
    animation: false,
    grid: {
      top: 6,
      left: 8,
      right: 8,
      bottom: 6
    },
    tooltip: {
      show: false
    },
    xAxis: {
      type: 'category',
      data: compactHistory.map((item) => formatTime(item.capturedAt)),
      show: false,
      axisLine: {
        lineStyle: {
          color: '#5cecff'
        }
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      show: false,
      axisLabel: {
        formatter: '{value}%',
        color: '#8ca0bb'
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(92, 236, 255, 0.08)'
        }
      }
    },
    series: [
      {
        name: '5 小时剩余',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        data: compactHistory.map((item) => item.remainingPercent),
        lineStyle: {
          color: '#5cecff',
          width: 2.5
        },
        itemStyle: {
          color: '#5cecff'
        },
        areaStyle: {
          color: 'rgba(92, 236, 255, 0.12)'
        }
      }
    ]
  });
}

function renderRecords(records) {
  const compactRecords = (records ?? []).slice(0, 3);

  elements.recordList.innerHTML = compactRecords.map((record) => `
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

  const isRefreshing = dashboard.refreshStatus?.phase === 'refreshing' || dashboard.isRefreshing;
  setRefreshButtonState(isRefreshing);

  const applyAdviceState = (advice) => {
    if (!elements.flowAdviceBox) {
      return;
    }

    const level = advice?.level ?? 'unknown';
    elements.flowAdviceBox.dataset.level = level;
    if (elements.flowAdviceState) {
      elements.flowAdviceState.textContent = formatAdviceState(advice);
    }
  };

  if (!dashboard.summary) {
    const failureLine = formatFailureLine(dashboard);
    const flowAdvice = dashboard.flowAdvice ?? {
      title: '先等数据',
      message: '暂无足够本地数据，先刷新或做轻量 Review。',
      recommendedWork: ['刷新数据', '轻量 Review'],
      avoidWork: ['高成本改动'],
      basedOnStaleData: true
    };
    applyAdviceState(flowAdvice);
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
    elements.flowHours.textContent = flowAdvice.title;
    elements.flowDetail.textContent = formatAdviceMeta(flowAdvice);
    renderBurnRate(dashboard.quotaBurnRate);
    elements.refreshMeta.textContent = formatMetaLine(dashboard);
    elements.trendSourceLabel.textContent = `数据源：${dashboard.source.label}`;
    elements.flowAdviceTitle.textContent = '建议详情';
    elements.flowAdviceMeta.textContent = formatAdviceMeta(flowAdvice);
    elements.recommendationText.textContent = flowAdvice.message;
    renderAdviceChips(elements.flowAdviceRecommended, flowAdvice.recommendedWork);
    renderAdviceChips(elements.flowAdviceAvoid, flowAdvice.avoidWork);
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
  const flowAdvice = dashboard.flowAdvice ?? {
    title: dashboard.prediction?.recommendedIntensity === 'low'
      ? '先收一点'
      : '保持节奏',
    message: dashboard.prediction?.recommendation ?? '建议保持当前节奏。',
    recommendedWork: dashboard.prediction?.recommendedIntensity === 'low'
      ? ['小任务', '修 bug']
      : ['当前节奏'],
    avoidWork: dashboard.prediction?.recommendedIntensity === 'low'
      ? ['大重构']
      : ['过度切换'],
    basedOnStaleData: false
  };
  applyAdviceState(flowAdvice);
  elements.flowHours.textContent = flowAdvice.title;
  elements.flowDetail.textContent = formatAdviceMeta(flowAdvice);
  renderBurnRate(dashboard.quotaBurnRate);
  elements.flowAdviceTitle.textContent = '建议详情';
  elements.flowAdviceMeta.textContent = formatAdviceMeta(flowAdvice);
  elements.refreshMeta.textContent = formatMetaLine(dashboard);
  elements.trendSourceLabel.textContent = `数据源：${dashboard.source.label}`;
  elements.recommendationText.textContent = flowAdvice.message;
  renderAdviceChips(elements.flowAdviceRecommended, flowAdvice.recommendedWork);
  renderAdviceChips(elements.flowAdviceAvoid, flowAdvice.avoidWork);
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
  setRefreshButtonState(true);
  const dashboard = await window.codexMonitor.refreshQuota({
    reason: 'manual',
    force: true
  }).catch((error) => {
    console.error('manual refresh failed', error);
    return null;
  });

  if (dashboard) {
    renderDashboard(dashboard);
    return;
  }

  setRefreshButtonState(false);
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
