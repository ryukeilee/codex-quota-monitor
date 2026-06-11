const TEN_MINUTES_MS = 10 * 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;

const HEALTH_LEVELS = new Set([
  'healthy',
  'delayed',
  'stale',
  'fallback',
  'error'
]);

function toMs(value) {
  if (value == null) {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function normalizeSource(sourceOrigin = 'unknown') {
  if (sourceOrigin === 'wham_usage') {
    return 'wham_usage';
  }

  if (sourceOrigin === 'codex_app_server') {
    return 'app_server_rate_limits';
  }

  if (sourceOrigin === 'local_snapshot' || sourceOrigin === 'memory_cache') {
    return 'snapshot_fallback';
  }

  return 'unknown';
}

function isLiveSource(source) {
  return source === 'wham_usage' || source === 'app_server_rate_limits';
}

function formatSourceLabel(source) {
  switch (source) {
    case 'wham_usage':
      return 'wham/usage';
    case 'app_server_rate_limits':
      return 'app-server';
    case 'snapshot_fallback':
      return '本地快照';
    case 'unknown':
    default:
      return '未知来源';
  }
}

function formatHealthMessage(level) {
  switch (level) {
    case 'healthy':
      return '数据正常 · 实时数据';
    case 'delayed':
      return '数据可能延迟 · 建议手动刷新';
    case 'stale':
      return '数据已过期 · 请立即刷新';
    case 'fallback':
      return '正在使用本地缓存 · 实时数据源不可用';
    case 'error':
    default:
      return '数据不可用 · 请检查 Codex 登录状态或网络';
  }
}

function pickLastSuccessfulAt(dashboard, refreshStatus) {
  return refreshStatus?.lastSuccessAt
    ?? dashboard?.lastSuccessfulRefreshAt
    ?? dashboard?.refreshedAt
    ?? null;
}

function pickLastRefreshAt(dashboard, refreshStatus) {
  return refreshStatus?.lastAttemptAt
    ?? dashboard?.lastRefreshStartedAt
    ?? dashboard?.refreshedAt
    ?? null;
}

function pickNextAutoRefreshAt(refreshStatus) {
  return refreshStatus?.nextScheduledRefreshAt ?? null;
}

export function buildQuotaHealthStatus(dashboard, { now = Date.now() } = {}) {
  const refreshStatus = dashboard?.refreshStatus ?? {};
  const source = normalizeSource(
    refreshStatus.dataSource
      ?? dashboard?.source?.origin
      ?? 'unknown'
  );
  const hasSummary = Boolean(dashboard?.summary);
  const isRefreshing = refreshStatus.phase === 'refreshing' || refreshStatus.phase === 'sleep_recovering' || Boolean(dashboard?.isRefreshing);
  const isFallback = source === 'snapshot_fallback' || refreshStatus.phase === 'using_snapshot';
  const lastSuccessfulRefreshAt = pickLastSuccessfulAt(dashboard, refreshStatus);
  const lastRefreshAt = pickLastRefreshAt(dashboard, refreshStatus);
  const lastRefreshReason = refreshStatus.lastRefreshReason ?? dashboard?.lastRefreshReason ?? null;
  const lastErrorCode = refreshStatus.lastErrorCode ?? dashboard?.lastErrorCode ?? null;
  const lastErrorMessage = refreshStatus.lastErrorMessage ?? dashboard?.lastRefreshError ?? refreshStatus.failureReason ?? null;
  const successfulAtMs = toMs(lastSuccessfulRefreshAt);
  const nowMs = toMs(now);
  const dataAgeMs = successfulAtMs != null && nowMs != null ? Math.max(nowMs - successfulAtMs, 0) : null;
  const hasRecentFailure = Boolean(refreshStatus.failureReason || dashboard?.lastRefreshError);
  const isLiveData = isLiveSource(source);

  let level = 'error';
  if (isFallback && hasSummary) {
    level = 'fallback';
  } else if (hasSummary && isLiveData && successfulAtMs != null) {
    if (dataAgeMs <= TEN_MINUTES_MS) {
      level = 'healthy';
    } else if (dataAgeMs <= THIRTY_MINUTES_MS) {
      level = 'delayed';
    } else {
      level = 'stale';
    }
  } else if (hasSummary && isLiveData && successfulAtMs == null) {
    level = 'error';
  } else if (hasSummary && !isLiveData) {
    level = isFallback ? 'fallback' : 'stale';
  } else if (!hasSummary && hasRecentFailure) {
    level = isFallback ? 'fallback' : 'error';
  } else if (hasSummary && dataAgeMs != null) {
    level = dataAgeMs <= TEN_MINUTES_MS ? 'healthy' : (dataAgeMs <= THIRTY_MINUTES_MS ? 'delayed' : 'stale');
  }

  if (!HEALTH_LEVELS.has(level)) {
    level = 'error';
  }

  return {
    level,
    source,
    message: formatHealthMessage(level),
    lastRefreshAt: toMs(lastRefreshAt),
    lastSuccessfulRefreshAt: successfulAtMs,
    nextAutoRefreshAt: toMs(pickNextAutoRefreshAt(refreshStatus)),
    dataAgeMs,
    isFallback: level === 'fallback' || isFallback,
    isStale: level === 'stale',
    isRefreshing,
    lastRefreshReason,
    lastErrorCode,
    lastErrorMessage
  };
}

export function formatQuotaHealthStatusLabel(healthStatus) {
  switch (healthStatus?.level) {
    case 'healthy':
      return '正常';
    case 'delayed':
      return '延迟';
    case 'stale':
      return '过期';
    case 'fallback':
      return '使用缓存';
    case 'error':
    default:
      return '不可用';
  }
}

export function formatQuotaHealthSourceLabel(healthStatus) {
  return formatSourceLabel(healthStatus?.source ?? 'unknown');
}

export function formatQuotaHealthReason(healthStatus) {
  if (!healthStatus) {
    return '暂无';
  }

  if (healthStatus.level === 'healthy') {
    return '实时数据可用';
  }

  if (healthStatus.level === 'delayed') {
    return '数据更新较慢';
  }

  if (healthStatus.level === 'stale') {
    return '数据长时间未更新';
  }

  if (healthStatus.level === 'fallback') {
    return '实时数据源失败';
  }

  return healthStatus.lastErrorMessage ?? '实时数据源或本地快照都不可用';
}

export function formatQuotaHealthTime(value) {
  if (!value) {
    return '暂无';
  }

  return new Date(value).toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatQuotaHealthDuration(value) {
  if (!Number.isFinite(value) || value == null) {
    return '暂无';
  }

  const totalSeconds = Math.max(0, Math.round(value / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes <= 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}
