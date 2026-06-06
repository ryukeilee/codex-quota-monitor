import * as echarts from 'echarts';
import { formatUsageDetail } from '../utils/format-usage.js';

const chart = echarts.init(document.getElementById('history-chart'));

const elements = {
  refreshButton: document.getElementById('refresh-button'),
  refreshMeta: document.getElementById('refresh-meta'),
  remainingPercent: document.getElementById('remaining-percent'),
  remainingDetail: document.getElementById('remaining-detail'),
  weeklyPercent: document.getElementById('weekly-percent'),
  weeklyDetail: document.getElementById('weekly-detail'),
  windowState: document.getElementById('window-state'),
  windowDetail: document.getElementById('window-detail'),
  recoveryTime: document.getElementById('recovery-time'),
  recoveryDetail: document.getElementById('recovery-detail'),
  flowHours: document.getElementById('flow-hours'),
  flowDetail: document.getElementById('flow-detail'),
  sourceLabel: document.getElementById('source-label'),
  recommendationText: document.getElementById('recommendation-text'),
  recordList: document.getElementById('record-list'),
  preferencesForm: document.getElementById('preferences-form'),
  isActive: document.getElementById('is-active'),
  isHighIntensity: document.getElementById('is-high-intensity'),
  fiveHourBudget: document.getElementById('five-hour-budget'),
  showPercentageInMenuBar: document.getElementById('show-percentage-in-menu-bar'),
  closeToMenuBar: document.getElementById('close-to-menu-bar'),
  notificationsEnabled: document.getElementById('notifications-enabled'),
  autoLaunchEnabled: document.getElementById('auto-launch-enabled'),
  pureMenuBarMode: document.getElementById('pure-menu-bar-mode'),
  showMiniPanelOnTrayClick: document.getElementById('show-mini-panel-on-tray-click')
};

function formatTime(value) {
  if (!value) {
    return '暂无';
  }

  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function renderHistory(history) {
  chart.setOption({
    animation: false,
    grid: {
      top: 24,
      left: 48,
      right: 24,
      bottom: 36
    },
    tooltip: {
      trigger: 'axis'
    },
    xAxis: {
      type: 'category',
      data: history.map((item) => formatTime(item.capturedAt)),
      axisLine: {
        lineStyle: {
          color: '#c8b9ad'
        }
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLabel: {
        formatter: '{value}%'
      }
    },
    series: [
      {
        type: 'line',
        smooth: true,
        data: history.map((item) => item.remainingPercent),
        lineStyle: {
          color: '#b65d3a',
          width: 3
        },
        itemStyle: {
          color: '#b65d3a'
        },
        areaStyle: {
          color: 'rgba(182, 93, 58, 0.12)'
        }
      }
    ]
  });
}

function renderRecords(records) {
  elements.recordList.innerHTML = records.map((record) => `
    <article class="record-item">
      <div>
        <div class="record-amount">-${record.amount}</div>
        <div class="record-meta">${record.model} / ${record.intensity}</div>
      </div>
      <div class="record-meta">${formatTime(record.at)}</div>
    </article>
  `).join('');
}

function renderDashboard(dashboard) {
  elements.remainingPercent.textContent = `${dashboard.summary.remainingPercent}%`;
  elements.remainingDetail.textContent = `当前窗口 ${formatUsageDetail(dashboard.summary)}`;
  elements.weeklyPercent.textContent = dashboard.weeklySummary
    ? `${dashboard.weeklySummary.remainingPercent}%`
    : '--';
  elements.weeklyDetail.textContent = dashboard.weeklySummary
    ? `近 7 天 ${formatUsageDetail(dashboard.weeklySummary)}`
    : '暂无周数据';
  elements.windowState.textContent = dashboard.summary.windowState === 'near_limit' ? '接近额度墙' : '状态健康';
  elements.windowDetail.textContent = `${dashboard.summary.windowUsageCount} 条窗口内记录`;
  elements.recoveryTime.textContent = formatTime(dashboard.summary.nextRecoveryAt);
  elements.recoveryDetail.textContent = dashboard.summary.nextRecoveryAt
    ? '按照最早一笔窗口内消耗估算'
    : '暂无待恢复记录';
  elements.flowHours.textContent = Number.isFinite(dashboard.prediction.hoursRemaining)
    ? `${dashboard.prediction.hoursRemaining} 小时`
    : '充足';
  elements.flowDetail.textContent = `当前建议：${dashboard.prediction.recommendedIntensity}`;
  elements.refreshMeta.textContent = `最近刷新 ${formatTime(dashboard.refreshedAt)}`;
  elements.sourceLabel.textContent = `数据源：${dashboard.source.label}`;
  elements.recommendationText.textContent = dashboard.prediction.recommendation;
  elements.isActive.checked = dashboard.preferences.isActive;
  elements.isHighIntensity.checked = dashboard.preferences.isHighIntensity;
  elements.fiveHourBudget.value = dashboard.preferences.fiveHourBudget;
  elements.showPercentageInMenuBar.checked = dashboard.preferences.showPercentageInMenuBar;
  elements.closeToMenuBar.checked = dashboard.preferences.closeToMenuBar;
  elements.notificationsEnabled.checked = dashboard.preferences.notificationsEnabled;
  elements.autoLaunchEnabled.checked = dashboard.preferences.autoLaunchEnabled;
  elements.pureMenuBarMode.checked = dashboard.preferences.pureMenuBarMode;
  elements.showMiniPanelOnTrayClick.checked = dashboard.preferences.showMiniPanelOnTrayClick;

  renderHistory(dashboard.history);
  renderRecords(dashboard.recentRecords);
}

elements.refreshButton.addEventListener('click', async () => {
  const dashboard = await window.codexMonitor.refreshDashboard();
  renderDashboard(dashboard);
});

elements.preferencesForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const dashboard = await window.codexMonitor.updatePreferences({
    isActive: elements.isActive.checked,
    isHighIntensity: elements.isHighIntensity.checked,
    fiveHourBudget: Number(elements.fiveHourBudget.value),
    showPercentageInMenuBar: elements.showPercentageInMenuBar.checked,
    closeToMenuBar: elements.closeToMenuBar.checked,
    notificationsEnabled: elements.notificationsEnabled.checked,
    autoLaunchEnabled: elements.autoLaunchEnabled.checked,
    pureMenuBarMode: elements.pureMenuBarMode.checked,
    showMiniPanelOnTrayClick: elements.showMiniPanelOnTrayClick.checked
  });
  renderDashboard(dashboard);
});

window.codexMonitor.onDashboardUpdated((dashboard) => {
  renderDashboard(dashboard);
});

const initialDashboard = await window.codexMonitor.loadDashboard();
renderDashboard(initialDashboard);

window.addEventListener('resize', () => {
  chart.resize();
});
