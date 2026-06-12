const TEN_MINUTES_MS = 10 * 60 * 1000;

const FLOW_ADVICE_MESSAGES = {
  refreshFirst: {
    level: 'unknown',
    title: '先刷新数据',
    message: '再判断额度',
    action: 'refresh_first',
    recommendedWork: ['刷新数据'],
    avoidWork: ['基于旧数据做判断']
  },
  keepGoing: {
    level: 'healthy',
    title: '继续开发',
    message: '保持当前节奏',
    action: 'keep',
    recommendedWork: ['继续开发'],
    avoidWork: []
  },
  slowDown: {
    level: 'watch',
    title: '放慢节奏',
    message: '拆小任务执行',
    action: 'slow_down',
    recommendedWork: ['拆小任务', '分步验证'],
    avoidWork: ['长上下文连续推进']
  },
  smallFixesOnly: {
    level: 'warning',
    title: '只做小修',
    message: '避免大重构',
    action: 'small_fixes_only',
    recommendedWork: ['修小 bug', '看日志', '写文档', '做验证'],
    avoidWork: ['大重构', '跨模块改动']
  },
  waitRecovery: {
    level: 'critical',
    title: '暂停高强度开发',
    message: '等窗口恢复',
    action: 'wait_recovery',
    recommendedWork: ['Review', '规划', '收尾'],
    avoidWork: ['大重构', '长任务']
  },
  preserveWeekly: {
    level: 'warning',
    title: '降低强度',
    message: '保留周额度',
    action: 'slow_down',
    recommendedWork: ['小步修改', '分步验证'],
    avoidWork: ['高消耗连续开发']
  },
  observe: {
    level: 'unknown',
    title: '先观察',
    message: '等待有效数据',
    action: 'refresh_first',
    recommendedWork: ['等待有效数据'],
    avoidWork: ['高强度开发']
  }
};

function clampPercent(value) {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function toTimestamp(value) {
  if (value == null) {
    return null;
  }

  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function pickPercent(explicitValue, summary) {
  return clampPercent(explicitValue ?? summary?.remainingPercent);
}

function getHealthLevel(quotaHealth) {
  if (typeof quotaHealth === 'string') {
    return quotaHealth;
  }

  return quotaHealth?.level ?? 'unknown';
}

function isFallbackSource(refreshStatus, sourceOrigin) {
  const dataSource = refreshStatus?.dataSource ?? sourceOrigin ?? 'unknown';
  return dataSource === 'local_snapshot' || dataSource === 'memory_cache';
}

function isOlderThanTenMinutes(refreshStatus, now) {
  const lastSuccessAt = refreshStatus?.lastSuccessAt ?? refreshStatus?.lastSuccessfulRefreshAt ?? null;
  const lastSuccessMs = toTimestamp(lastSuccessAt);
  const nowMs = toTimestamp(now);

  if (lastSuccessMs == null || nowMs == null) {
    return false;
  }

  return Math.max(nowMs - lastSuccessMs, 0) > TEN_MINUTES_MS;
}

function isDataUnreliable({ refreshStatus, quotaHealth, freshness, sourceOrigin, now }) {
  const phase = refreshStatus?.phase ?? 'idle';
  const effectiveFreshness = freshness ?? refreshStatus?.freshness ?? 'unknown';
  const healthLevel = getHealthLevel(quotaHealth);

  return phase === 'failed'
    || effectiveFreshness === 'stale'
    || healthLevel === 'delayed'
    || healthLevel === 'stale'
    || healthLevel === 'fallback'
    || healthLevel === 'error'
    || isFallbackSource(refreshStatus, sourceOrigin)
    || isOlderThanTenMinutes(refreshStatus, now);
}

function withMetadata(key, basedOnStaleData) {
  return {
    ...FLOW_ADVICE_MESSAGES[key],
    basedOnStaleData
  };
}

export function buildFlowAdvice({
  weeklyRemainingPercent,
  windowRemainingPercent,
  fiveHourRemainingPercent,
  weeklySummary,
  summary,
  quotaBurnRate,
  refreshStatus,
  quotaHealth,
  freshness,
  prediction = null,
  now = new Date(),
  sourceOrigin = 'unknown'
} = {}) {
  const weeklyPercent = pickPercent(weeklyRemainingPercent, weeklySummary);
  const windowPercent = pickPercent(windowRemainingPercent ?? fiveHourRemainingPercent, summary);
  const hasWeeklyData = weeklyPercent != null;
  const hasWindowData = windowPercent != null;
  const hasRequiredQuotaData = hasWeeklyData && hasWindowData;
  const basedOnStaleData = isDataUnreliable({
    refreshStatus,
    quotaHealth,
    freshness,
    sourceOrigin,
    now
  });

  if (basedOnStaleData) {
    return withMetadata('refreshFirst', true);
  }

  if (!hasRequiredQuotaData) {
    return withMetadata('observe', false);
  }

  if (windowPercent <= 15) {
    return withMetadata('waitRecovery', false);
  }

  if (windowPercent <= 30) {
    return withMetadata('smallFixesOnly', false);
  }

  if (weeklyPercent <= 25) {
    return withMetadata('preserveWeekly', false);
  }

  if (quotaBurnRate?.level === 'critical' || quotaBurnRate?.level === 'high') {
    return withMetadata('slowDown', false);
  }

  const burnRateIsCalm = quotaBurnRate == null
    || quotaBurnRate.level === 'unknown'
    || quotaBurnRate.level === 'watch'
    || quotaBurnRate.level === 'steady';
  const predictionIsNotLow = prediction?.recommendedIntensity !== 'low';

  if (weeklyPercent >= 60 && windowPercent >= 50 && burnRateIsCalm && predictionIsNotLow) {
    return withMetadata('keepGoing', false);
  }

  return withMetadata('slowDown', false);
}
