const REFRESH_PHASES = new Set([
  'idle',
  'refreshing',
  'success',
  'failed',
  'using_snapshot',
  'sleep_recovering',
  'skipped'
]);

const DATA_SOURCES = new Set([
  'codex_app_server',
  'local_snapshot',
  'memory_cache',
  'unknown'
]);

const FRESHNESS_LEVELS = new Set([
  'fresh',
  'recent',
  'stale',
  'unknown'
]);

const DEFAULT_REFRESH_STATUS = {
  phase: 'idle',
  dataSource: 'unknown',
  freshness: 'unknown',
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  nextScheduledRefreshAt: null,
  failureReason: null,
  isRetryingAfterWake: false,
  retryAttempt: null
};

function normalizeValue(value, allowedValues, fallback) {
  return allowedValues.has(value) ? value : fallback;
}

function toIsoOrNull(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function createRefreshStatus(overrides = {}) {
  return {
    ...DEFAULT_REFRESH_STATUS,
    ...overrides,
    phase: normalizeValue(overrides.phase ?? DEFAULT_REFRESH_STATUS.phase, REFRESH_PHASES, DEFAULT_REFRESH_STATUS.phase),
    dataSource: normalizeValue(overrides.dataSource ?? DEFAULT_REFRESH_STATUS.dataSource, DATA_SOURCES, DEFAULT_REFRESH_STATUS.dataSource),
    freshness: normalizeValue(overrides.freshness ?? DEFAULT_REFRESH_STATUS.freshness, FRESHNESS_LEVELS, DEFAULT_REFRESH_STATUS.freshness),
    lastAttemptAt: toIsoOrNull(overrides.lastAttemptAt ?? DEFAULT_REFRESH_STATUS.lastAttemptAt),
    lastSuccessAt: toIsoOrNull(overrides.lastSuccessAt ?? DEFAULT_REFRESH_STATUS.lastSuccessAt),
    lastFailureAt: toIsoOrNull(overrides.lastFailureAt ?? DEFAULT_REFRESH_STATUS.lastFailureAt),
    nextScheduledRefreshAt: toIsoOrNull(overrides.nextScheduledRefreshAt ?? DEFAULT_REFRESH_STATUS.nextScheduledRefreshAt),
    failureReason: overrides.failureReason ?? DEFAULT_REFRESH_STATUS.failureReason,
    isRetryingAfterWake: Boolean(overrides.isRetryingAfterWake ?? DEFAULT_REFRESH_STATUS.isRetryingAfterWake),
    retryAttempt: overrides.retryAttempt ?? DEFAULT_REFRESH_STATUS.retryAttempt
  };
}

export function computeFreshness({
  lastSuccessAt,
  refreshInterval,
  now = new Date()
}) {
  if (!lastSuccessAt) {
    return 'unknown';
  }

  const successTime = new Date(lastSuccessAt).getTime();
  const nowTime = new Date(now).getTime();
  if (!Number.isFinite(successTime) || !Number.isFinite(nowTime)) {
    return 'unknown';
  }

  const ageMs = Math.max(nowTime - successTime, 0);
  if (!Number.isFinite(refreshInterval) || refreshInterval <= 0) {
    return ageMs <= 2 * 60 * 1000 ? 'fresh' : 'recent';
  }

  if (ageMs <= Math.min(refreshInterval * 0.5, 2 * 60 * 1000)) {
    return 'fresh';
  }

  if (ageMs <= refreshInterval * 1.5) {
    return 'recent';
  }

  return 'stale';
}

export function formatRefreshPhase(phase) {
  switch (phase) {
    case 'refreshing':
      return '刷新中';
    case 'success':
      return '最近成功';
    case 'failed':
      return '刷新失败';
    case 'using_snapshot':
      return '使用回退数据';
    case 'sleep_recovering':
      return '唤醒恢复中';
    case 'skipped':
      return '已跳过';
    case 'idle':
    default:
      return '空闲';
  }
}

export function formatDataSource(dataSource) {
  switch (dataSource) {
    case 'codex_app_server':
      return '实时数据';
    case 'local_snapshot':
      return '本地快照';
    case 'memory_cache':
      return '缓存数据';
    case 'unknown':
    default:
      return '未知来源';
  }
}

export function formatFreshness(freshness) {
  switch (freshness) {
    case 'fresh':
      return '新鲜';
    case 'recent':
      return '最近';
    case 'stale':
      return '过期';
    case 'unknown':
    default:
      return '未知';
  }
}

export function formatRefreshStatus(status) {
  const normalized = createRefreshStatus(status);

  return {
    phaseLabel: formatRefreshPhase(normalized.phase),
    dataSourceLabel: formatDataSource(normalized.dataSource),
    freshnessLabel: formatFreshness(normalized.freshness)
  };
}
