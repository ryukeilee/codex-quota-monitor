const FLOW_ADVICE_LEVELS = new Set([
  'good',
  'light',
  'careful',
  'review_only',
  'unknown'
]);

function clampPercent(value) {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeLevel(level) {
  return FLOW_ADVICE_LEVELS.has(level) ? level : 'unknown';
}

function buildAdviceCopy(level, basedOnStaleData) {
  switch (level) {
    case 'good':
      return {
        title: '适合开大任务',
        message: basedOnStaleData
          ? '数据不够新，还是优先做可回滚的大步推进。'
          : '额度充足，适合推进新功能或重构。',
        recommendedWork: ['新功能', '重构', '长任务'],
        avoidWork: ['频繁切换', '碎片化跟进']
      };
    case 'light':
      return {
        title: '适合小步推进',
        message: basedOnStaleData
          ? '数据偏旧，建议只做小任务或局部推进。'
          : '额度还行，先做小任务或拆分推进。',
        recommendedWork: ['小功能', '修 bug', '补测试'],
        avoidWork: ['大重构', '跨模块改动']
      };
    case 'careful':
      return {
        title: '先控范围',
        message: basedOnStaleData
          ? '数据偏旧或额度偏紧，建议缩小到单点修改。'
          : '额度偏紧，建议缩小到单点修改。',
        recommendedWork: ['局部修复', 'Review', '补文档'],
        avoidWork: ['大改架构', '多模块联动']
      };
    case 'review_only':
      return {
        title: '只做 Review / 收尾',
        message: basedOnStaleData
          ? '数据不新或额度很紧，适合 Review、规划、收尾。'
          : '额度很紧，适合 Review、规划、收尾。',
        recommendedWork: ['Review', '规划', '收尾'],
        avoidWork: ['新功能', '大重构']
      };
    case 'unknown':
    default:
      return {
        title: '先等数据',
        message: '暂无足够本地数据，先刷新或做轻量 Review。',
        recommendedWork: ['刷新数据', '轻量 Review'],
        avoidWork: ['高成本改动']
      };
  }
}

export function buildFlowAdvice({
  weeklySummary,
  summary,
  refreshStatus,
  sourceOrigin = 'unknown'
} = {}) {
  const weeklyRemainingPercent = clampPercent(weeklySummary?.remainingPercent);
  const fiveHourRemainingPercent = clampPercent(summary?.remainingPercent);
  const hasWeeklyData = weeklyRemainingPercent != null;
  const hasFiveHourData = fiveHourRemainingPercent != null;
  const hasAnyQuotaData = hasWeeklyData || hasFiveHourData;
  const freshness = refreshStatus?.freshness ?? 'unknown';
  const phase = refreshStatus?.phase ?? 'idle';
  const basedOnStaleData = sourceOrigin !== 'codex_app_server'
    || freshness === 'stale'
    || phase === 'failed'
    || !hasAnyQuotaData;

  if (!hasAnyQuotaData) {
    return {
      level: 'unknown',
      ...buildAdviceCopy('unknown', basedOnStaleData),
      basedOnStaleData
    };
  }

  const effectiveRemainingPercent = Math.min(
    hasWeeklyData ? weeklyRemainingPercent : 100,
    hasFiveHourData ? fiveHourRemainingPercent : 100
  );

  let level = 'good';
  if (effectiveRemainingPercent <= 15) {
    level = 'review_only';
  } else if (effectiveRemainingPercent <= 35) {
    level = 'careful';
  } else if (effectiveRemainingPercent <= 65) {
    level = 'light';
  }

  if (basedOnStaleData) {
    if (level === 'good') {
      level = 'light';
    } else if (level === 'light') {
      level = 'careful';
    } else if (level === 'careful') {
      level = 'review_only';
    }
  }

  if (phase === 'refreshing' && level === 'good') {
    level = 'light';
  }

  level = normalizeLevel(level);
  return {
    level,
    ...buildAdviceCopy(level, basedOnStaleData),
    basedOnStaleData
  };
}
