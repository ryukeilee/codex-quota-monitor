import { app, Menu, Notification, Tray, ipcMain, nativeImage, powerMonitor } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createMonitorService } from './monitor/monitor-service.js';
import { createRefreshScheduler } from './monitor/refresh-scheduler.js';
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

const shouldDisableHardwareAcceleration = process.env.CODEX_MONITOR_DISABLE_GPU !== '0';

if (shouldDisableHardwareAcceleration) {
  app.disableHardwareAcceleration();
}

let logger = fallbackLogger;
let tray = null;
let monitorService = null;
let refreshScheduler = null;
let isQuitting = false;
let currentDashboard = null;

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

async function applyPresentationMode(preferences) {
  if (process.platform !== 'darwin') {
    return;
  }

  app.setActivationPolicy('accessory');
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

async function updatePreferencesWithScheduler(preferences) {
  const dashboard = await monitorService.updatePreferences(preferences);
  refreshScheduler.start(dashboard);
  return dashboard;
}

function updateTray(dashboard) {
  if (!tray || !dashboard) {
    return;
  }

  currentDashboard = dashboard;
  const menuBarState = buildMenuBarState(dashboard);
  const refreshAction = menuBarState.refreshAction ?? {
    label: '立即刷新',
    enabled: true
  };
  tray.setImage(createTrayIcon());
  tray.setTitle(menuBarState.title, { fontType: 'monospacedDigit' });
  tray.setToolTip(menuBarState.toolTip);
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: menuBarState.lines.overviewLabel,
      enabled: false
    },
    {
      label: menuBarState.lines.statusLabel,
      enabled: false
    },
    {
      label: menuBarState.lines.updateLabel,
      enabled: false
    },
    ...(menuBarState.lines.reasonLabel
      ? [{
          label: menuBarState.lines.reasonLabel,
          enabled: false
        }]
      : []),
    {
      label: menuBarState.lines.burnRateLabel,
      enabled: false
    },
    {
      label: menuBarState.lines.adviceLabel,
      enabled: false
    },
    { type: 'separator' },
    {
      label: refreshAction.label,
      enabled: refreshAction.enabled,
      click: async () => {
        if (monitorService && refreshAction.enabled) {
          const optimisticDashboard = {
            ...dashboard,
            refreshStatus: {
              ...dashboard.refreshStatus,
              phase: 'refreshing',
              lastAttemptAt: new Date().toISOString(),
              lastRefreshReason: 'manual',
              failureReason: null,
              lastErrorCode: null,
              lastErrorMessage: null
            }
          };
          updateTray(optimisticDashboard);
          try {
            await refreshScheduler.requestRefresh({
              reason: 'manual',
              force: true
            });
          } catch (error) {
            logger.error({
              error: error?.message ?? String(error)
            }, 'manual refresh failed');
          }
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
          await updatePreferencesWithScheduler({
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
          await updatePreferencesWithScheduler({
            autoLaunchEnabled: !dashboard.preferences.autoLaunchEnabled
          });
        }
      }
    },
    {
      type: 'separator'
    },
    {
      label: '退出应用',
      click: () => app.quit()
    }
  ]));
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
  logger = createLogger(storageRoot);

  monitorService = await createMonitorService({
    onUpdated: (dashboard) => {
      updateTray(dashboard);
      applyPresentationMode(dashboard.preferences);
    },
    onNotify: showNotification,
    logger,
    getSystemPreferences,
    applySystemPreferences,
    workspaceRoot,
    storageRoot
  });
  refreshScheduler = createRefreshScheduler({
    runRefresh: (options) => monitorService.refreshQuota(options),
    onStateChange: (patch) => {
      if (monitorService) {
        monitorService.setRefreshContext(patch);
      }
    },
    logger
  });

  ipcMain.handle('dashboard:refresh', async (_event, options = {}) => (
    refreshScheduler.requestRefresh(options)
  ));
  ipcMain.handle('preferences:update', async (_, preferences) => (
    updatePreferencesWithScheduler(preferences)
  ));

  powerMonitor.on('suspend', () => {
    refreshScheduler.markSleeping();
  });

  powerMonitor.on('resume', () => {
    refreshScheduler.resumeFromSleep('resume');
  });

  powerMonitor.on('unlock-screen', () => {
    refreshScheduler.resumeFromSleep('unlock');
  });

  tray = new Tray(createTrayIcon());
  tray.setToolTip('Codex Monitor');
  const dashboard = await monitorService.init();
  refreshScheduler.start(dashboard);
  updateTray(dashboard);
  await applyPresentationMode(dashboard.preferences);
}

app.whenReady().then(async () => {
  if (process.platform === 'darwin') {
    app.setActivationPolicy('accessory');
    app.dock?.hide();
  }
  await bootstrap();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  isQuitting = true;
  refreshScheduler?.dispose();
  if (monitorService) {
    await monitorService.dispose();
  }
});

process.on('uncaughtException', (error) => {
  logger.error({ error }, 'uncaught exception');
});
