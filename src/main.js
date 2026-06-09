import { app, BrowserWindow, Menu, Notification, Tray, ipcMain, nativeImage, powerMonitor } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createMonitorService } from './monitor/monitor-service.js';
import { resolveRuntimeRoots } from './core/runtime-roots.js';
import { buildMenuBarState } from './notification/menu-bar-presenter.js';
import { buildTrayIconSvg } from './utils/icon-assets.js';
import { createLogger } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fallbackLogger = {
  info: (...args) => console.info(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
  debug: (...args) => console.debug(...args)
};

let logger = fallbackLogger;
let mainWindow = null;
let tray = null;
let monitorService = null;
let isQuitting = false;
let wakeRefreshTimers = [];

function readRuntimeConfig() {
  const runtimeConfigFile = path.join(app.getAppPath(), 'runtime-config.json');
  if (!fs.existsSync(runtimeConfigFile)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(runtimeConfigFile, 'utf8'));
  } catch (error) {
    fallbackLogger.warn('failed to read runtime config', error);
    return {};
  }
}

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
  if (monitorService) {
    monitorService.setRefreshContext({
      isRetryingAfterWake: false,
      retryAttempt: null
    });
  }
}

function createTrayIcon() {
  const svg = buildTrayIconSvg();
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
    width: 1140,
    height: 780,
    minWidth: 920,
    minHeight: 660,
    backgroundColor: '#f5f0e8',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  attachWebContentsDiagnostics(mainWindow, 'main');
  await mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));
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

  app.setActivationPolicy('accessory');
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setSkipTaskbar(true);
  }
  app.dock?.hide();
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

  if (monitorService) {
    monitorService.setRefreshContext({
      isRetryingAfterWake: true,
      retryAttempt: 0
    });
  }

  logger.debug({
    reason,
    delaysMs: [5, 15, 30, 60].map((seconds) => seconds * 1000)
  }, 'wake retry scheduled');

  const retryDelaysMs = [5, 15, 30, 60].map((seconds) => seconds * 1000);

  for (const [index, delayMs] of retryDelaysMs.entries()) {
    const timer = setTimeout(async () => {
      if (!monitorService || isQuitting) {
        return;
      }

      const beforeDashboard = monitorService.getDashboard();
      try {
        monitorService.setRefreshContext({
          isRetryingAfterWake: true,
          retryAttempt: index + 1
        });
        const nextDashboard = await monitorService.refreshQuota({
          reason,
          force: true,
          isRetryingAfterWake: true,
          retryAttempt: index + 1
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
          if (monitorService) {
            monitorService.setRefreshContext({
              isRetryingAfterWake: false,
              retryAttempt: null
            });
          }
        } else if (index === retryDelaysMs.length - 1) {
          monitorService.setRefreshContext({
            isRetryingAfterWake: false,
            retryAttempt: null
          });
        }
      } catch (error) {
        logger.error({
          reason,
          delayMs,
          error: error?.message ?? String(error)
        }, 'wake refresh sequence failed');
        if (index === retryDelaysMs.length - 1 && monitorService) {
          monitorService.setRefreshContext({
            isRetryingAfterWake: false,
            retryAttempt: null
          });
        }
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
      label: menuBarState.lines.statusLabel,
      enabled: false
    },
    {
      label: menuBarState.lines.sourceLabel,
      enabled: false
    },
    {
      label: menuBarState.lines.freshnessLabel,
      enabled: false
    },
    { type: 'separator' },
    {
      label: menuBarState.lines.weeklyLabel,
      enabled: false
    },
    {
      label: menuBarState.lines.weeklyStatusLabel,
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
      label: menuBarState.lines.recoveryLabel,
      enabled: false
    },
    {
      label: menuBarState.lines.lastRefreshLabel,
      enabled: false
    },
    {
      label: menuBarState.lines.lastSuccessLabel,
      enabled: false
    },
    {
      label: menuBarState.lines.lastFailureLabel,
      enabled: false
    },
    {
      label: menuBarState.lines.wakeLabel,
      enabled: false
    },
    {
      label: menuBarState.lines.nextRefreshLabel,
      enabled: false
    },
    {
      label: menuBarState.lines.failureReasonLabel,
      enabled: false
    },
    {
      label: menuBarState.lines.refreshLabel,
      enabled: false
    },
    {
      label: menuBarState.lines.predictionLabel,
      enabled: false
    },
    {
      label: menuBarState.lines.developmentLabel,
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
      label: '打开主窗口',
      click: () => showMainWindow()
    },
    {
      type: 'checkbox',
      label: '菜单栏显示周百分比',
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
  const runtimeConfig = readRuntimeConfig();
  const { workspaceRoot, storageRoot } = resolveRuntimeRoots({
    runtimeConfig,
    fallbackRoot: process.cwd()
  });
  const shouldShowMainWindow = process.env.CODEX_MONITOR_SHOW_MAIN_WINDOW === '1';
  logger = createLogger(storageRoot);

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
    applySystemPreferences,
    workspaceRoot,
    storageRoot
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
  const dashboard = await monitorService.init();
  await createMainWindow();
  updateTray(dashboard);
  syncDashboardWhenReady(mainWindow, dashboard);
  if (shouldShowMainWindow) {
    showMainWindow();
  }
  applyCloseToMenuBarBehavior(dashboard);
  await applyPresentationMode(dashboard.preferences);
}

app.whenReady().then(async () => {
  if (process.platform === 'darwin') {
    app.setActivationPolicy('accessory');
    app.dock?.hide();
  }
  await bootstrap();

app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
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
