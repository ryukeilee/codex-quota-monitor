const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('codexMonitor', {
  refreshQuota: (options = {}) => ipcRenderer.invoke('dashboard:refresh', options),
  updatePreferences: (preferences) => ipcRenderer.invoke('preferences:update', preferences)
});
