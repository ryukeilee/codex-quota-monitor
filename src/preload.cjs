const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('codexMonitor', {
  loadDashboard: () => ipcRenderer.invoke('dashboard:load'),
  refreshQuota: (options = {}) => ipcRenderer.invoke('dashboard:refresh', options),
  refreshDashboard: () => ipcRenderer.invoke('dashboard:refresh', {
    reason: 'manual',
    force: true
  }),
  updatePreferences: (preferences) => ipcRenderer.invoke('preferences:update', preferences),
  onDashboardUpdated: (listener) => {
    const wrapped = (_, payload) => listener(payload);
    ipcRenderer.on('dashboard:updated', wrapped);
    return () => ipcRenderer.removeListener('dashboard:updated', wrapped);
  }
});
