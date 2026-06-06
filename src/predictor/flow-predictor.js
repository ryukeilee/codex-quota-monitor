function toTimestamp(value) {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

export function predictFlow({ summary, records = [], now = new Date() }) {
  if (records.length === 0) {
    return {
      burnRatePerHour: 0,
      hoursRemaining: Infinity,
      willHitWall: false,
      recommendedIntensity: 'current',
      recommendation: '当前暂无消耗记录，继续观察即可。'
    };
  }

  const sorted = records
    .map((record) => ({
      ...record,
      timestamp: toTimestamp(record.at)
    }))
    .sort((left, right) => left.timestamp - right.timestamp);

  const firstTs = sorted[0].timestamp;
  const nowTs = toTimestamp(now);
  const spanHours = Math.max((nowTs - firstTs) / (60 * 60 * 1000), 1);
  const totalUsed = sorted.reduce((sum, record) => sum + record.amount, 0);
  const burnRatePerHour = totalUsed / spanHours;
  const rawHoursRemaining = burnRatePerHour > 0 ? summary.remaining / burnRatePerHour : Infinity;
  const hoursRemaining = Number.isFinite(rawHoursRemaining) ? Math.round(rawHoursRemaining) : Infinity;
  const willHitWall = Number.isFinite(rawHoursRemaining) && rawHoursRemaining <= 2;

  if (willHitWall) {
    return {
      burnRatePerHour,
      hoursRemaining,
      willHitWall,
      recommendedIntensity: 'low',
      recommendation: '建议降低推理强度，避免在当前窗口内撞到额度墙。'
    };
  }

  return {
    burnRatePerHour,
    hoursRemaining,
    willHitWall,
    recommendedIntensity: 'current',
    recommendation: '当前消耗速度平稳，建议保持当前节奏。'
  };
}
