import fs from 'node:fs';
import path from 'node:path';
import { formatUsageDetail } from './format-usage.js';

function formatRecovery(value) {
  if (!value) {
    return '暂无';
  }

  return new Date(value).toLocaleString('zh-CN');
}

export function isLiveDashboard(dashboard) {
  return dashboard?.source?.label === 'codex-account-rate-limits';
}

export function writeDashboardArtifact(dashboard, baseDir = process.cwd()) {
  if (!isLiveDashboard(dashboard) || !dashboard?.summary) {
    return;
  }

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
    `开发心流建议: ${dashboard.flowAdvice?.title ?? '暂无'}`,
    `建议依据: ${dashboard.flowAdvice?.basedOnStaleData ? '偏旧数据' : '实时数据'}`,
    `窗口状态: ${dashboard.summary.windowState}`,
    `预计恢复: ${formatRecovery(dashboard.summary.nextRecoveryAt)}`,
    `刷新阶段: ${dashboard.refreshStatus?.phase ?? (dashboard.isRefreshing ? 'refreshing' : 'idle')}`,
    `数据来源: ${dashboard.refreshStatus?.dataSource ?? 'unknown'}`,
    `数据新鲜度: ${dashboard.refreshStatus?.freshness ?? 'unknown'}`,
    `最近尝试刷新: ${formatRecovery(dashboard.refreshStatus?.lastAttemptAt ?? dashboard.lastRefreshStartedAt)}`,
    `最近成功刷新: ${formatRecovery(dashboard.refreshStatus?.lastSuccessAt ?? dashboard.lastSuccessfulRefreshAt)}`,
    `最近失败刷新: ${formatRecovery(dashboard.refreshStatus?.lastFailureAt ?? null)}`,
    `下次计划刷新: ${formatRecovery(dashboard.refreshStatus?.nextScheduledRefreshAt ?? null)}`,
    `是否唤醒恢复: ${dashboard.refreshStatus?.isRetryingAfterWake ? '是' : '否'}`,
    `恢复重试次数: ${dashboard.refreshStatus?.retryAttempt ?? '暂无'}`,
    `是否过期: ${dashboard.isStale ? '是' : '否'}`,
    `最近刷新错误: ${dashboard.refreshStatus?.failureReason ?? dashboard.lastRefreshError ?? '暂无'}`,
    `数据源: ${dashboard.source.label}`,
    `最近刷新: ${new Date(dashboard.refreshedAt).toLocaleString('zh-CN')}`
  ].join('\n');

  fs.writeFileSync(textPath, `${text}\n`);
}

export function readDashboardArtifact(baseDir = process.cwd()) {
  const jsonPath = path.join(baseDir, 'data', 'latest-dashboard.json');

  if (!fs.existsSync(jsonPath)) {
    return null;
  }

  try {
    const dashboard = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    return isLiveDashboard(dashboard) ? dashboard : null;
  } catch {
    return null;
  }
}
