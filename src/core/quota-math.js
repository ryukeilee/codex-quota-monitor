const WINDOW_MS = 5 * 60 * 60 * 1000;
const NEAR_LIMIT_PERCENT = 15;

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

export function getRefreshInterval({
  isActive = false,
  isHighIntensity = false,
  remainingPercent = 100
}) {
  if (!isActive) {
    return 10 * 60 * 1000;
  }

  if (remainingPercent <= 15) {
    return 15 * 1000;
  }

  if (isHighIntensity) {
    return 30 * 1000;
  }

  return 2 * 60 * 1000;
}
