const FIVE_HOUR_WINDOW_MS = 5 * 60 * 60 * 1000;

function toTimestamp(value) {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

export function buildIncrementalUsageRecords({
  records = [],
  previousByThread = {},
  now = new Date(),
  resetState = false
}) {
  const nowTs = toTimestamp(now);
  const usageRecords = [];
  const nextStateByThread = {};

  for (const record of records) {
    if (!record.threadId || !Number.isFinite(record.totalTokens)) {
      continue;
    }

    const previous = previousByThread[record.threadId];
    let amount = 0;

    if (previous) {
      amount = Math.max(record.totalTokens - previous.lastTotalTokens, 0);
    } else {
      const baselineTs = resetState ? toTimestamp(record.at) : toTimestamp(record.createdAt);
      if (Number.isFinite(baselineTs) && nowTs - baselineTs <= FIVE_HOUR_WINDOW_MS) {
        amount = Math.max(record.totalTokens, 0);
      }
    }

    nextStateByThread[record.threadId] = {
      lastSeenAt: record.at,
      lastTotalTokens: record.totalTokens
    };

    if (amount <= 0) {
      continue;
    }

    usageRecords.push({
      threadId: record.threadId,
      at: record.at,
      amount,
      model: record.model,
      intensity: record.intensity
    });
  }

  return {
    usageRecords,
    nextStateByThread
  };
}
