export function formatUsageDetail(summary) {
  if (!summary) {
    return '暂无';
  }

  if (summary.presentation === 'percent') {
    return `${summary.used}%`;
  }

  return `${summary.used}/${summary.limit}`;
}
