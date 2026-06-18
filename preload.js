const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  disk: {
    overview: () => ipcRenderer.invoke('disk:overview')
  },
  paint: {
    list: () => ipcRenderer.invoke('paint:list'),
    files: (carId) => ipcRenderer.invoke('paint:files', carId),
    delete: (carId, files) => ipcRenderer.invoke('paint:delete', { carId, files }),
    deleteDownloaded: (carId) => ipcRenderer.invoke('paint:delete-downloaded', carId),
    deleteAllDownloaded: () => ipcRenderer.invoke('paint:delete-all-downloaded')
  },
  telemetry: {
    list: () => ipcRenderer.invoke('telemetry:list'),
    delete: (files) => ipcRenderer.invoke('telemetry:delete', files),
    openFolder: () => ipcRenderer.invoke('telemetry:open-folder')
  },
  win: {
    minimize: () => ipcRenderer.send('win:minimize'),
    maximize: () => ipcRenderer.send('win:maximize'),
    close: () => ipcRenderer.send('win:close')
  }
});
