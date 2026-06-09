import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildQuotaAlertStatus,
  getQuotaAlertLevel
} from '../src/core/quota-alert.js';

test('getQuotaAlertLevel maps weekly remaining quota into four silent reminder levels', () => {
  assert.equal(getQuotaAlertLevel(92), 'normal');
  assert.equal(getQuotaAlertLevel(60), 'watch');
  assert.equal(getQuotaAlertLevel(30), 'warning');
  assert.equal(getQuotaAlertLevel(14), 'critical');
});

test('buildQuotaAlertStatus keeps notifications silent unless the quota is critical and notifications are enabled', () => {
  assert.deepEqual(buildQuotaAlertStatus({
    weeklyRemainingPercent: 28,
    notificationsEnabled: true
  }), {
    level: 'warning',
    weeklyRemainingPercent: 28,
    message: '周额度较低，建议降低使用强度。',
    shouldShowInMenu: true,
    shouldShowNotification: false
  });

  assert.deepEqual(buildQuotaAlertStatus({
    weeklyRemainingPercent: 12,
    notificationsEnabled: true
  }), {
    level: 'critical',
    weeklyRemainingPercent: 12,
    message: '周额度很低，建议尽快降频或暂停。',
    shouldShowInMenu: true,
    shouldShowNotification: true
  });

  assert.deepEqual(buildQuotaAlertStatus({
    weeklyRemainingPercent: null,
    notificationsEnabled: true
  }), {
    level: 'normal',
    weeklyRemainingPercent: null,
    message: '暂无周额度数据',
    shouldShowInMenu: false,
    shouldShowNotification: false
  });
});
