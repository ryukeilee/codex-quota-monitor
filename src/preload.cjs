const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('codexMonitor', {
  loadDashboard: () => ipcRenderer.invoke('dashboard:load'),
  refreshDashboard: () => ipcRenderer.invoke('dashboard:refresh'),
  updatePreferences: (preferences) => ipcRenderer.invoke('preferences:update', preferences),
  onDashboardUpdated: (listener) => {
    const wrapped = (_, payload) => listener(payload);
    ipcRenderer.on('dashboard:updated', wrapped);
    return () => ipcRenderer.removeListener('dashboard:updated', wrapped);
  }
});
