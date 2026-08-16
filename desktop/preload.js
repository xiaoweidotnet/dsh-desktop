import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('dshDesktop', {
  getInfo: () => ipcRenderer.invoke('dsh:get-info'),
  retry: () => ipcRenderer.invoke('dsh:retry'),
  chooseWorkspace: () => ipcRenderer.invoke('dsh:choose-workspace'),
  openLogs: () => ipcRenderer.invoke('dsh:open-logs'),
  checkUpdates: () => ipcRenderer.invoke('dsh:check-updates'),
  checkDesktopUpdates: () => ipcRenderer.invoke('dsh:check-desktop-updates'),
  reloadPage: () => ipcRenderer.invoke('dsh:reload-page'),
  onStatus: (listener) => {
    const handler = (_event, payload) => listener(payload)
    ipcRenderer.on('dsh:status', handler)
    return () => ipcRenderer.removeListener('dsh:status', handler)
  },
})
