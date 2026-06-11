const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function toTimestamp(value) {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function clampPercent(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(100, value));
}

function formatHours(value) {
  if (!Number.isFinite(value)) {
    return '较久';
  }

  if (value < 1) {
    return '不到 1 小时';
  }

  if (value < 24) {
    return `${Math.round(value)} 小时`;
  }

  return `${Math.round(value / 24)} 天`;
}

function analyzeSeries(points, key) {
  const normalized = points
    .map((point) => ({
      ts: toTimestamp(point.capturedAt),
      value: clampPercent(point[key])
    }))
    .filter((point) => Number.isFinite(point.ts) && point.value != null)
    .sort((left, right) => left.ts - right.ts);

  if (normalized.length < 2) {
    return null;
  }

  let startIndex = 0;
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index].value > normalized[index - 1].value + 1) {
      startIndex = index;
    }
  }

  const segment = normalized.slice(startIndex);
  if (segment.length < 2) {
    return null;
  }

  const first = segment[0];
  const last = segment[segment.length - 1];
  const spanHours = Math.max((last.ts - first.ts) / HOUR_MS, 0);
  if (spanHours <= 0) {
    return null;
  }

  const dropPercent = Math.max(first.value - last.value, 0);
  const burnRatePerHour = dropPercent / spanHours;
  const hoursRemaining = burnRatePerHour > 0 ? last.value / burnRatePerHour : Infinity;

  return {
    sampleCount: segment.length,
    spanHours,
    startPercent: Math.round(first.value),
    endPercent: Math.round(last.value),
    burnRatePerHour,
    hoursRemaining
  };
}

function classifyBurnRate({ weekly, window5h }) {
  const effectiveHoursRemaining = Math.min(
    weekly?.hoursRemaining ?? Infinity,
    window5h?.hoursRemaining ?? Infinity
  );
  const weeklyRate = weekly?.burnRatePerHour ?? 0;
  const windowRate = window5h?.burnRatePerHour ?? 0;

  if (effectiveHoursRemaining <= 2 || weeklyRate >= 8 || windowRate >= 20) {
    return {
      level: 'critical',
      isBurningFast: true,
      recommendedIntensity: 'lower',
      title: '消耗偏快',
      message: `按当前速度，额度大约还能撑 ${formatHours(effectiveHoursRemaining)}，建议立刻降模型或推理强度。`
    };
  }

  if (effectiveHoursRemaining <= 6 || weeklyRate >= 4 || windowRate >= 10) {
    return {
      level: 'high',
      isBurningFast: true,
      recommendedIntensity: 'lower',
      title: '消耗有点快',
      message: `按当前速度，额度大约还能撑 ${formatHours(effectiveHoursRemaining)}，建议优先改成更省额度的开发节奏。`
    };
  }

  if (effectiveHoursRemaining <= 16 || weeklyRate >= 2 || windowRate >= 5) {
    return {
      level: 'watch',
      isBurningFast: false,
      recommendedIntensity: 'current',
      title: '消耗可控',
      message: `按当前速度，额度大约还能撑 ${formatHours(effectiveHoursRemaining)}，先保持节奏并留意后续变化。`
    };
  }

  return {
    level: 'steady',
    isBurningFast: false,
    recommendedIntensity: 'current',
    title: '消耗平稳',
    message: `按当前速度，额度大约还能撑 ${formatHours(effectiveHoursRemaining)}，暂时不需要主动降强度。`
  };
}

export function analyzeQuotaBurnRate({ snapshots = [], now = new Date() } = {}) {
  const nowTs = toTimestamp(now);
  const recentSnapshots = snapshots.filter((snapshot) => {
    const ts = toTimestamp(snapshot.capturedAt);
    return Number.isFinite(ts) && (nowTs - ts) <= DAY_MS;
  });

  const weekly = analyzeSeries(recentSnapshots, 'weeklyRemainingPercent');
  const window5h = analyzeSeries(recentSnapshots, 'window5hRemainingPercent');

  if (!weekly && !window5h) {
    return {
      level: 'unknown',
      isBurningFast: false,
      recommendedIntensity: 'observe',
      title: '先继续观察',
      message: '本地快照还不够，暂时无法判断消耗速度。',
      estimatedTimeRemaining: null,
      weeklyBurnRatePerHour: null,
      window5hBurnRatePerHour: null,
      basedOnHours: 0
    };
  }

  const classification = classifyBurnRate({ weekly, window5h });
  const estimatedHoursRemaining = Math.min(
    weekly?.hoursRemaining ?? Infinity,
    window5h?.hoursRemaining ?? Infinity
  );
  const basedOnHours = Math.max(
    weekly?.spanHours ?? 0,
    window5h?.spanHours ?? 0
  );

  return {
    ...classification,
    estimatedTimeRemaining: Number.isFinite(estimatedHoursRemaining)
      ? formatHours(estimatedHoursRemaining)
      : '较久',
    estimatedHoursRemaining,
    weeklyBurnRatePerHour: weekly?.burnRatePerHour ?? null,
    window5hBurnRatePerHour: window5h?.burnRatePerHour ?? null,
    weekly,
    window5h,
    basedOnHours
  };
}
