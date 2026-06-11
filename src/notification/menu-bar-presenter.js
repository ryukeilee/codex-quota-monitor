import { buildQuotaAlertStatus } from '../core/quota-alert.js';
import {
  createRefreshStatus,
  formatRefreshStatus,
  formatDataSource,
  formatFreshness,
  computeFreshness
} from '../core/refresh-status.js';
import {
  buildQuotaHealthStatus,
  formatQuotaHealthReason,
  formatQuotaHealthStatusLabel,
  formatQuotaHealthTime
} from '../core/quota-health.js';

function formatUpdateLabel(value) {
  if (!value) {
    return '更新于 暂无';
  }

  return `更新于 ${new Date(value).toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  })}`;
}

function formatPredictionState(prediction) {
  if (!prediction) {
    return '先等数据';
  }

  if (prediction.recommendedIntensity === 'low') {
    return '建议降速';
  }

  if (prediction.recommendedIntensity === 'current') {
    return '保持当前节奏';
  }

  return '先等数据';
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

function formatOverviewLabel(summary, weeklySummary) {
  const windowRemainingPercent = summary
    ? `${summary.remainingPercent}%`
    : '暂无';
  const weeklyRemainingPercent = weeklySummary
    ? `${weeklySummary.remainingPercent}%`
    : '暂无';

  return `周 ${weeklyRemainingPercent} · 5小时 ${windowRemainingPercent}`;
}

function formatStatusLabel(refreshStatus, quotaAlertStatus) {
  const quotaLabel = quotaAlertStatus.shouldShowInMenu
    ? formatQuotaAlertLevel(quotaAlertStatus.level)
    : '暂无';

  return `状态 ${quotaLabel} · ${formatDataSource(refreshStatus.dataSource)} · ${formatFreshness(refreshStatus.freshness)}`;
}

function formatAdviceLabel(flowAdvice, prediction) {
  return `建议 ${formatFlowAdviceState(flowAdvice, prediction)}`;
}

function formatBurnRateLabel(quotaBurnRate) {
  if (!quotaBurnRate || quotaBurnRate.level === 'unknown') {
    return '消耗 先观察';
  }

  const paceLabelMap = {
    critical: '很快',
    high: '偏快',
    watch: '正常',
    steady: '平稳'
  };

  const paceLabel = paceLabelMap[quotaBurnRate.level] ?? '先观察';
  const hoursRemaining = quotaBurnRate.estimatedHoursRemaining;
  const hoursLabel = Number.isFinite(hoursRemaining)
    ? `${Math.max(1, Math.round(hoursRemaining))}h`
    : '较久';

  return `消耗 ${paceLabel} · 约 ${hoursLabel}`;
}

function formatRefreshActionLabel(refreshStatus, healthStatus) {
  if (refreshStatus?.phase === 'refreshing') {
    return '正在刷新...';
  }

  if (healthStatus?.level === 'fallback') {
    return '刷新失败 · 使用缓存';
  }

  if (refreshStatus?.phase === 'failed' || healthStatus?.level === 'error') {
    return healthStatus?.isFallback ? '刷新失败 · 使用缓存' : '刷新失败';
  }

  if (refreshStatus?.phase === 'success' || refreshStatus?.phase === 'using_snapshot') {
    return '立即刷新';
  }

  return '立即刷新';
}

function formatTrayTitle(summary, weeklySummary, preferences) {
  if (!preferences.showPercentageInMenuBar) {
    return '';
  }

  if (!weeklySummary) {
    return '--';
  }

  return `${weeklySummary.remainingPercent}%`;
}

export function formatRefreshLabel(intervalMs) {
  if (intervalMs < 60 * 1000) {
    return `下次刷新约 ${Math.round(intervalMs / 1000)} 秒后`;
  }

  return `下次刷新约 ${Math.round(intervalMs / (60 * 1000))} 分钟后`;
}

export function buildMenuBarState(dashboard, { now = new Date() } = {}) {
  const sourceData = dashboard.refreshStatus?.dataSource
    ?? dashboard.source?.origin
    ?? (dashboard.source?.label === 'local-codex-session-state'
      ? 'local_snapshot'
      : (dashboard.summary ? 'codex_app_server' : 'unknown'));
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
        refreshInterval: dashboard.refreshInterval,
        now
      })
    });
  const quotaHealth = dashboard.quotaHealth
    ?? buildQuotaHealthStatus({
      ...dashboard,
      refreshStatus
    }, {
      now
    });
  const refreshLabels = formatRefreshStatus(refreshStatus);
  const quotaAlertStatus = buildQuotaAlertStatus({
    weeklyRemainingPercent: dashboard.weeklySummary?.remainingPercent ?? dashboard.summary?.remainingPercent,
    notificationsEnabled: dashboard.preferences.notificationsEnabled
  });
  const quotaAlertTooltipLabel = quotaAlertStatus.shouldShowInMenu
    ? formatQuotaAlertLevel(quotaAlertStatus.level)
    : '暂无';
  const overviewLabel = formatOverviewLabel(dashboard.summary, dashboard.weeklySummary);
  const statusLabel = formatStatusLabel(refreshStatus, quotaAlertStatus);
  const burnRateLabel = formatBurnRateLabel(dashboard.quotaBurnRate);
  const adviceLabel = formatAdviceLabel(dashboard.flowAdvice, dashboard.prediction);
  const refreshActionLabel = formatRefreshActionLabel(refreshStatus, quotaHealth);
  const refreshActionEnabled = refreshStatus.phase !== 'refreshing' && refreshStatus.phase !== 'sleep_recovering';
  const updateLabel = formatUpdateLabel(lastSuccessAt ?? dashboard.refreshedAt ?? null);
  const healthStatusLabel = `数据状态：${formatQuotaHealthStatusLabel(quotaHealth)}`;
  const healthUpdateLabel = `更新时间：${formatQuotaHealthTime(quotaHealth.lastSuccessfulRefreshAt ?? lastSuccessAt ?? dashboard.refreshedAt ?? null)}`;
  const healthReasonLabel = quotaHealth.level === 'healthy'
    ? null
    : `原因：${formatQuotaHealthReason(quotaHealth)}`;

  return {
    title: formatTrayTitle(dashboard.summary, dashboard.weeklySummary, dashboard.preferences),
    toolTip: `Codex Monitor：${overviewLabel} · ${quotaAlertTooltipLabel} · ${quotaHealth.message}`,
    refreshAction: {
      label: refreshActionLabel,
      enabled: refreshActionEnabled
    },
    lines: {
      overviewLabel,
      statusLabel: healthStatusLabel,
      updateLabel: healthUpdateLabel,
      reasonLabel: healthReasonLabel,
      burnRateLabel,
      adviceLabel,
      refreshLabel: formatRefreshLabel(dashboard.refreshInterval)
    }
  };
}
