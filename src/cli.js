import { createMonitorService } from './monitor/monitor-service.js';
import { formatUsageDetail } from './utils/format-usage.js';

const logger = {
  info() {},
  error() {}
};

const service = await createMonitorService({
  onUpdated: () => {},
  onNotify: () => {},
  logger,
  getSystemPreferences: () => ({}),
  applySystemPreferences: async () => {}
});

try {
  const dashboard = await service.init();
  const lines = [
    `Codex 本地剩余额度: ${dashboard.summary.remainingPercent}%`,
    `已用: ${formatUsageDetail(dashboard.summary)}`,
    `周余额: ${dashboard.weeklySummary ? `${dashboard.weeklySummary.remainingPercent}%` : '暂无'}`,
    `周已用: ${dashboard.weeklySummary ? formatUsageDetail(dashboard.weeklySummary) : '暂无'}`,
    `状态: ${dashboard.summary.windowState}`,
    `恢复: ${dashboard.summary.nextRecoveryAt ?? '暂无'}`,
    `来源: ${dashboard.source.label}`
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
} finally {
  await service.dispose();
}
