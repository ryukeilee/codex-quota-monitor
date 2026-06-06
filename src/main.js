import { app, BrowserWindow, Menu, Notification, Tray, ipcMain, nativeImage } from 'electron';
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
      preload: path.join(__dirname, 'preload.js')
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
      preload: path.join(__dirname, 'preload.js')
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

function updateTray(dashboard) {
  if (!tray || !dashboard) {
    return;
  }

  const menuBarState = buildMenuBarState(dashboard);
  tray.setImage(createTrayIcon());
  tray.setTitle(menuBarState.title);
  tray.setToolTip(menuBarState.toolTip);
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: menuBarState.lines.windowLabel,
      enabled: false
    },
    {
      label: menuBarState.lines.weeklyLabel,
      enabled: false
    },
    {
      label: menuBarState.lines.statusLabel,
      enabled: false
    },
    {
      label: menuBarState.lines.predictionLabel,
      enabled: false
    },
    {
      label: menuBarState.lines.recoveryLabel,
      enabled: false
    },
    { type: 'separator' },
    {
      label: dashboard.preferences.closeToMenuBar ? '显示 / 隐藏主窗口' : '显示主窗口',
      click: () => toggleMainWindow()
    },
    {
      label: '显示 / 隐藏迷你统计面板',
      click: () => toggleMiniPanel()
    },
    {
      label: '立即刷新',
      click: async () => {
        if (monitorService) {
          await monitorService.refreshNow();
        }
      }
    },
    {
      label: dashboard.preferences.notificationsEnabled ? '关闭提醒通知' : '开启提醒通知',
      click: async () => {
        if (monitorService) {
          await monitorService.updatePreferences({
            notificationsEnabled: !dashboard.preferences.notificationsEnabled
          });
        }
      }
    },
    {
      label: dashboard.preferences.showPercentageInMenuBar ? '隐藏菜单栏百分比' : '显示菜单栏百分比',
      click: async () => {
        if (monitorService) {
          await monitorService.updatePreferences({
            showPercentageInMenuBar: !dashboard.preferences.showPercentageInMenuBar
          });
        }
      }
    },
    {
      label: dashboard.preferences.closeToMenuBar ? '关闭窗口时驻留菜单栏: 开' : '关闭窗口时驻留菜单栏: 关',
      click: async () => {
        if (monitorService) {
          await monitorService.updatePreferences({
            closeToMenuBar: !dashboard.preferences.closeToMenuBar
          });
        }
      }
    },
    {
      label: dashboard.preferences.showMiniPanelOnTrayClick ? '点击菜单栏打开迷你面板: 开' : '点击菜单栏打开迷你面板: 关',
      click: async () => {
        if (monitorService) {
          await monitorService.updatePreferences({
            showMiniPanelOnTrayClick: !dashboard.preferences.showMiniPanelOnTrayClick
          });
        }
      }
    },
    {
      label: dashboard.preferences.autoLaunchEnabled ? '开机自启动: 开' : '开机自启动: 关',
      click: async () => {
        if (monitorService) {
          await monitorService.updatePreferences({
            autoLaunchEnabled: !dashboard.preferences.autoLaunchEnabled
          });
        }
      }
    },
    {
      label: dashboard.preferences.pureMenuBarMode ? '纯菜单栏模式: 开' : '纯菜单栏模式: 关',
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
  ipcMain.handle('dashboard:refresh', async () => monitorService.refreshNow());
  ipcMain.handle('preferences:update', async (_, preferences) => (
    monitorService.updatePreferences(preferences)
  ));

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
  if (monitorService) {
    await monitorService.dispose();
  }
});

process.on('uncaughtException', (error) => {
  logger.error({ error }, 'uncaught exception');
});
