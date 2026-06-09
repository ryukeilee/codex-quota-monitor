const WINDOW_MS = 5 * 60 * 60 * 1000;
const NEAR_LIMIT_PERCENT = 15;
const NORMAL_REFRESH_MS = 5 * 60_000;

function toTimestamp(value) {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

export function summarizeUsage({ limit, now = new Date(), records = [], windowMs = WINDOW_MS }) {
  const nowTs = toTimestamp(now);
  const windowStart = nowTs - windowMs;
  const activeRecords = records
    .map((record) => ({
      ...record,
      timestamp: toTimestamp(record.at)
    }))
    .filter((record) => record.timestamp >= windowStart && record.timestamp <= nowTs)
    .sort((left, right) => left.timestamp - right.timestamp);

  const used = activeRecords.reduce((sum, record) => sum + record.amount, 0);
  const remaining = Math.max(limit - used, 0);
  const remainingPercent = limit > 0 ? Math.round((remaining / limit) * 100) : 0;
  const nextRecoveryAt = activeRecords.length > 0
    ? new Date(activeRecords[0].timestamp + windowMs).toISOString()
    : null;

  return {
    limit,
    used,
    remaining,
    remainingPercent,
    windowUsageCount: activeRecords.length,
    windowState: remainingPercent <= NEAR_LIMIT_PERCENT ? 'near_limit' : 'healthy',
    nextRecoveryAt
  };
}

export function buildUsageTrendHistory({
  limit,
  now = new Date(),
  records = [],
  windowMs = WINDOW_MS
}) {
  const nowTs = toTimestamp(now);
  const windowStart = nowTs - windowMs;
  const activeRecords = records
    .map((record) => ({
      ...record,
      timestamp: toTimestamp(record.at)
    }))
    .filter((record) => record.timestamp >= windowStart && record.timestamp <= nowTs)
    .sort((left, right) => left.timestamp - right.timestamp);

  if (!Number.isFinite(limit) || limit <= 0) {
    return activeRecords.map((record) => ({
      capturedAt: new Date(record.timestamp).toISOString(),
      remainingPercent: 0,
      remaining: 0,
      used: 0
    }));
  }

  const history = [
    {
      capturedAt: new Date(windowStart).toISOString(),
      remainingPercent: 100,
      remaining: limit,
      used: 0
    }
  ];

  let used = 0;
  for (const record of activeRecords) {
    used += Math.max(record.amount ?? 0, 0);
    const remaining = Math.max(limit - used, 0);
    history.push({
      capturedAt: new Date(record.timestamp).toISOString(),
      remainingPercent: Math.round((remaining / limit) * 100),
      remaining,
      used
    });
  }

  if (history.length === 1) {
    history[0] = {
      capturedAt: new Date(nowTs).toISOString(),
      remainingPercent: 100,
      remaining: limit,
      used: 0
    };
  }

  return history;
}

export function getRefreshInterval({
  isActive = false,
  isHighIntensity = false,
  remainingPercent = 100
}) {
  if (!isActive) {
    return NORMAL_REFRESH_MS;
  }

  if (remainingPercent <= 15) {
    return 15 * 1000;
  }

  if (isHighIntensity) {
    return 30 * 1000;
  }

  return NORMAL_REFRESH_MS;
}
