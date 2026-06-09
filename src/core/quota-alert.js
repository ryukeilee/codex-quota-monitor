const QUOTA_ALERT_THRESHOLDS = {
  watch: 60,
  warning: 30,
  critical: 15
};

const QUOTA_ALERT_MESSAGES = {
  normal: '周额度充足',
  watch: '周额度开始偏低，保持观察。',
  warning: '周额度较低，建议降低使用强度。',
  critical: '周额度很低，建议尽快降频或暂停。'
};

function clampPercent(value) {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

export function getQuotaAlertLevel(weeklyRemainingPercent) {
  const remainingPercent = clampPercent(weeklyRemainingPercent);

  if (remainingPercent == null) {
    return 'normal';
  }

  if (remainingPercent <= QUOTA_ALERT_THRESHOLDS.critical) {
    return 'critical';
  }

  if (remainingPercent <= QUOTA_ALERT_THRESHOLDS.warning) {
    return 'warning';
  }

  if (remainingPercent <= QUOTA_ALERT_THRESHOLDS.watch) {
    return 'watch';
  }

  return 'normal';
}

export function buildQuotaAlertStatus({
  weeklyRemainingPercent,
  notificationsEnabled = false
} = {}) {
  const remainingPercent = clampPercent(weeklyRemainingPercent);

  if (remainingPercent == null) {
    return {
      level: 'normal',
      weeklyRemainingPercent: null,
      message: '暂无周额度数据',
      shouldShowInMenu: false,
      shouldShowNotification: false
    };
  }

  const level = getQuotaAlertLevel(remainingPercent);

  return {
    level,
    weeklyRemainingPercent: remainingPercent ?? 0,
    message: QUOTA_ALERT_MESSAGES[level],
    shouldShowInMenu: true,
    shouldShowNotification: notificationsEnabled && level === 'critical'
  };
}
