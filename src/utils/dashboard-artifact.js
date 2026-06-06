import fs from 'node:fs';
import path from 'node:path';
import { formatUsageDetail } from './format-usage.js';

function formatRecovery(value) {
  if (!value) {
    return '暂无';
  }

  return new Date(value).toLocaleString('zh-CN');
}

export function writeDashboardArtifact(dashboard, baseDir = process.cwd()) {
  const dataDir = path.join(baseDir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const jsonPath = path.join(dataDir, 'latest-dashboard.json');
  const textPath = path.join(dataDir, 'latest-dashboard.txt');

  fs.writeFileSync(jsonPath, JSON.stringify(dashboard, null, 2));

  const text = [
    `剩余额度: ${dashboard.summary.remainingPercent}%`,
    `已用额度: ${formatUsageDetail(dashboard.summary)}`,
    `周余额: ${dashboard.weeklySummary ? `${dashboard.weeklySummary.remainingPercent}%` : '暂无'}`,
    `周已用: ${dashboard.weeklySummary ? formatUsageDetail(dashboard.weeklySummary) : '暂无'}`,
    `窗口状态: ${dashboard.summary.windowState}`,
    `预计恢复: ${formatRecovery(dashboard.summary.nextRecoveryAt)}`,
    `刷新中: ${dashboard.isRefreshing ? '是' : '否'}`,
    `最近成功刷新: ${formatRecovery(dashboard.lastSuccessfulRefreshAt)}`,
    `最近开始刷新: ${formatRecovery(dashboard.lastRefreshStartedAt)}`,
    `最近强制刷新: ${formatRecovery(dashboard.lastForcedRefreshAt)}`,
    `是否过期: ${dashboard.isStale ? '是' : '否'}`,
    `最近刷新错误: ${dashboard.lastRefreshError ?? '暂无'}`,
    `数据源: ${dashboard.source.label}`,
    `最近刷新: ${new Date(dashboard.refreshedAt).toLocaleString('zh-CN')}`
  ].join('\n');

  fs.writeFileSync(textPath, `${text}\n`);
}
