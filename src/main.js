import { app, BrowserWindow, Menu, Notification, Tray, ipcMain, nativeImage, powerMonitor } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createMonitorService } from './monitor/monitor-service.js';
import { buildMenuBarState } from './notification/menu-bar-presenter.js';
import { createLogger } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createLogger();
let mainWindow = null;
let miniPanelWindow = null;
let tray = null;
let monitorService = null;
let isQuitting = false;
let wakeRefreshTimers = [];

function clearWakeRefreshTimers({ reason, cause }) {
  if (wakeRefreshTimers.length > 0) {
    logger.debug({
      reason,
      cause,
      clearedCount: wakeRefreshTimers.length
    }, 'wake retry cleared');
  }

  for (const timer of wakeRefreshTimers) {
    clearTimeout(timer);
  }
  wakeRefreshTimers = [];
}

function createTrayIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
      <rect x="3" y="10" width="2" height="5" rx="1" fill="black" />
      <rect x="8" y="7" width="2" height="8" rx="1" fill="black" />
      <rect x="13" y="4" width="2" height="11" rx="1" fill="black" />
    </svg>
  `.trim();
  const image = nativeImage
    .createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`)
    .resize({ width: 18, height: 18 });

  if (process.platform === 'darwin') {
    image.setTemplateImage(true);
  }

  return image;
}

function attachWebContentsDiagnostics(window, name) {
  if (!window) {
    return;
  }

  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    logger.info({
      name,
      level,
      message,
      line,
      sourceId
    }, 'renderer console message');
  });

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logger.error({
      name,
      errorCode,
      errorDescription,
      validatedURL
    }, 'renderer failed to load');
  });

  window.webContents.on('render-process-gone', (_event, details) => {
    logger.error({
      name,
      ...details
    }, 'renderer process gone');
  });
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 980,
    minHeight: 720,
    backgroundColor: '#f5f0e8',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  attachWebContentsDiagnostics(mainWindow, 'main');
  await mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));
}

async function createMiniPanelWindow() {
  miniPanelWindow = new BrowserWindow({
    width: 360,
    height: 440,
    minWidth: 340,
    minHeight: 400,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    frame: false,
    show: false,
    movable: true,
    backgroundColor: '#f5f0e8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  attachWebContentsDiagnostics(miniPanelWindow, 'mini');
  await miniPanelWindow.loadFile(path.join(__dirname, 'ui', 'mini-panel.html'));
  miniPanelWindow.on('blur', () => {
    if (miniPanelWindow && !miniPanelWindow.isDestroyed()) {
      miniPanelWindow.hide();
    }
  });
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.show();
  mainWindow.focus();
}

function toggleMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (mainWindow.isVisible()) {
    mainWindow.hide();
    return;
  }

  showMainWindow();
}

function toggleMiniPanel() {
  if (!miniPanelWindow || miniPanelWindow.isDestroyed()) {
    return;
  }

  if (miniPanelWindow.isVisible()) {
    miniPanelWindow.hide();
    return;
  }

  miniPanelWindow.show();
  miniPanelWindow.focus();
}

function applyCloseToMenuBarBehavior(dashboard) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.removeAllListeners('close');
  mainWindow.on('close', (event) => {
    if (isQuitting || !dashboard.preferences.closeToMenuBar) {
      return;
    }

    event.preventDefault();
    mainWindow.hide();
  });
}

async function applyPresentationMode(preferences) {
  if (process.platform !== 'darwin') {
    return;
  }

  if (preferences.pureMenuBarMode) {
    app.setActivationPolicy('accessory');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setSkipTaskbar(true);
    }
    if (miniPanelWindow && !miniPanelWindow.isDestroyed()) {
      miniPanelWindow.setSkipTaskbar(true);
    }
    setTimeout(() => {
      app.dock?.hide();
    }, 1100);
    return;
  }

  app.setActivationPolicy('regular');
  await app.dock?.show();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setSkipTaskbar(false);
  }
}

function getSystemPreferences() {
  const loginItemSettings = app.getLoginItemSettings();
  return {
    autoLaunchEnabled: loginItemSettings.openAtLogin,
    wasOpenedAtLogin: loginItemSettings.wasOpenedAtLogin
  };
}

async function applySystemPreferences(preferences) {
  app.setLoginItemSettings({
    openAtLogin: preferences.autoLaunchEnabled
  });
  await applyPresentationMode(preferences);
}

function scheduleWakeRefreshSequence(reason = 'resume') {
  clearWakeRefreshTimers({
    reason,
    cause: 'reschedule'
  });

  logger.debug({
    reason,
    delaysMs: [5, 15, 30, 60].map((seconds) => seconds * 1000)
  }, 'wake retry scheduled');

  for (const delayMs of [5, 15, 30, 60].map((seconds) => seconds * 1000)) {
    const timer = setTimeout(async () => {
      if (!monitorService || isQuitting) {
        return;
      }

      const beforeDashboard = monitorService.getDashboard();
      try {
        const nextDashboard = await monitorService.refreshQuota({
          reason,
          force: true,
        });
        const didRefreshQuotaValue = Boolean(
          nextDashboard &&
          beforeDashboard &&
          (
            nextDashboard.summary?.remainingPercent !== beforeDashboard.summary?.remainingPercent ||
            nextDashboard.weeklySummary?.remainingPercent !== beforeDashboard.weeklySummary?.remainingPercent ||
            nextDashboard.source?.label !== beforeDashboard.source?.label
          )
        );

        if (didRefreshQuotaValue) {
          clearWakeRefreshTimers({
            reason,
            cause: 'quota-updated'
          });
        }
      } catch (error) {
        logger.error({
          reason,
          delayMs,
          error: error?.message ?? String(error)
        }, 'wake refresh sequence failed');
      }
    }, delayMs);

    wakeRefreshTimers.push(timer);
  }
}

function updateTray(dashboard) {
  if (!tray || !dashboard) {
    return;
  }

  const menuBarState = buildMenuBarState(dashboard);
  tray.setImage(createTrayIcon());
  tray.setTitle(menuBarState.title, { fontType: 'monospacedDigit' });
  tray.setToolTip(menuBarState.toolTip);
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: menuBarState.lines.weeklyLabel,
      enabled: false
    },
    {
      label: menuBarState.lines.weeklyResetLabel,
      enabled: false
    },
    {
      label: menuBarState.lines.windowLabel,
      enabled: false
    },
    {
      label: menuBarState.lines.lastRefreshLabel,
      enabled: false
    },
    { type: 'separator' },
    {
      label: '立即刷新',
      click: async () => {
        if (monitorService) {
          await monitorService.refreshQuota({
            reason: 'manual',
            force: true
          });
        }
      }
    },
    {
      type: 'separator'
    },
    {
      type: 'checkbox',
      label: '低额度提醒通知',
      checked: dashboard.preferences.notificationsEnabled,
      click: async () => {
        if (monitorService) {
          await monitorService.updatePreferences({
            notificationsEnabled: !dashboard.preferences.notificationsEnabled
          });
        }
      }
    },
    {
      type: 'checkbox',
      label: '开机自启动',
      checked: dashboard.preferences.autoLaunchEnabled,
      click: async () => {
        if (monitorService) {
          await monitorService.updatePreferences({
            autoLaunchEnabled: !dashboard.preferences.autoLaunchEnabled
          });
        }
      }
    },
    {
      type: 'separator'
    },
    {
      label: '打开 Dashboard',
      click: () => showMainWindow()
    },
    {
      label: '显示 / 隐藏迷你统计面板',
      click: () => toggleMiniPanel()
    },
    {
      type: 'checkbox',
      label: '菜单栏显示 Weekly 百分比',
      checked: dashboard.preferences.showPercentageInMenuBar,
      click: async () => {
        if (monitorService) {
          await monitorService.updatePreferences({
            showPercentageInMenuBar: !dashboard.preferences.showPercentageInMenuBar
          });
        }
      }
    },
    {
      type: 'checkbox',
      label: '关闭窗口时驻留菜单栏',
      checked: dashboard.preferences.closeToMenuBar,
      click: async () => {
        if (monitorService) {
          await monitorService.updatePreferences({
            closeToMenuBar: !dashboard.preferences.closeToMenuBar
          });
        }
      }
    },
    {
      type: 'checkbox',
      label: '点击菜单栏打开迷你面板',
      checked: dashboard.preferences.showMiniPanelOnTrayClick,
      click: async () => {
        if (monitorService) {
          await monitorService.updatePreferences({
            showMiniPanelOnTrayClick: !dashboard.preferences.showMiniPanelOnTrayClick
          });
        }
      }
    },
    {
      type: 'checkbox',
      label: '纯菜单栏模式',
      checked: dashboard.preferences.pureMenuBarMode,
      click: async () => {
        if (monitorService) {
          await monitorService.updatePreferences({
            pureMenuBarMode: !dashboard.preferences.pureMenuBarMode
          });
        }
      }
    },
    { type: 'separator' },
    {
      label: '退出应用',
      click: () => app.quit()
    }
  ]));
}

function pushDashboardToWindows(dashboard) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('dashboard:updated', dashboard);
  }
  if (miniPanelWindow && !miniPanelWindow.isDestroyed()) {
    miniPanelWindow.webContents.send('dashboard:updated', dashboard);
  }
}

function syncDashboardWhenReady(window, dashboard) {
  if (!window || window.isDestroyed()) {
    return;
  }

  const sendDashboard = () => {
    if (!window.isDestroyed()) {
      window.webContents.send('dashboard:updated', dashboard);
    }
  };

  if (window.webContents.isLoadingMainFrame()) {
    window.webContents.once('did-finish-load', sendDashboard);
    return;
  }

  sendDashboard();
}

function showNotification(payload) {
  if (!Notification.isSupported()) {
    return;
  }

  const notification = new Notification({
    title: payload.title,
    body: payload.body,
    silent: false
  });
  notification.show();
}

async function bootstrap() {
  monitorService = await createMonitorService({
    onUpdated: (dashboard) => {
      updateTray(dashboard);
      applyCloseToMenuBarBehavior(dashboard);
      applyPresentationMode(dashboard.preferences);
      pushDashboardToWindows(dashboard);
    },
    onNotify: showNotification,
    logger,
    getSystemPreferences,
    applySystemPreferences
  });

  ipcMain.handle('dashboard:load', async () => monitorService.getDashboard());
  ipcMain.handle('dashboard:refresh', async (_event, options = {}) => (
    monitorService.refreshQuota(options)
  ));
  ipcMain.handle('preferences:update', async (_, preferences) => (
    monitorService.updatePreferences(preferences)
  ));

  powerMonitor.on('resume', async () => {
    scheduleWakeRefreshSequence('resume');
  });

  powerMonitor.on('unlock-screen', async () => {
    scheduleWakeRefreshSequence('unlock');
  });

  tray = new Tray(createTrayIcon());
  tray.setToolTip('Codex Monitor');
  tray.on('click', async () => {
    const dashboard = monitorService.getDashboard();
    if (dashboard?.preferences.showMiniPanelOnTrayClick) {
      toggleMiniPanel();
      return;
    }
    toggleMainWindow();
  });
  const dashboard = await monitorService.init();
  await createMainWindow();
  await createMiniPanelWindow();
  updateTray(dashboard);
  syncDashboardWhenReady(mainWindow, dashboard);
  syncDashboardWhenReady(miniPanelWindow, dashboard);
  applyCloseToMenuBarBehavior(dashboard);
  await applyPresentationMode(dashboard.preferences);
  if (!dashboard.preferences.pureMenuBarMode && !getSystemPreferences().wasOpenedAtLogin) {
    showMainWindow();
  }
}

app.whenReady().then(async () => {
  await bootstrap();

app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
      await createMiniPanelWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  isQuitting = true;
  clearWakeRefreshTimers({
    reason: 'shutdown',
    cause: 'before-quit'
  });
  if (monitorService) {
    await monitorService.dispose();
  }
});

process.on('uncaughtException', (error) => {
  logger.error({ error }, 'uncaught exception');
});
