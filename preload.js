const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  disk:     { overview: () => ipcRenderer.invoke('disk:overview') },
  paint:    {
    list:                () => ipcRenderer.invoke('paint:list'),
    files:               (id) => ipcRenderer.invoke('paint:files', id),
    delete:              (id, files) => ipcRenderer.invoke('paint:delete', { carId:id, files }),
    deleteDownloaded:    (id) => ipcRenderer.invoke('paint:delete-downloaded', id),
    deleteAllDownloaded: () => ipcRenderer.invoke('paint:delete-all-downloaded')
  },
  telemetry: {
    list:       () => ipcRenderer.invoke('telemetry:list'),
    delete:     (f) => ipcRenderer.invoke('telemetry:delete', f),
    openFolder: () => ipcRenderer.invoke('telemetry:open-folder')
  },
  setups: {
    cars:       () => ipcRenderer.invoke('setups:cars'),
    files:      (id) => ipcRenderer.invoke('setups:files', id),
    note:       (carId, file, note) => ipcRenderer.invoke('setups:note', { carId, file, note }),
    fav:        (carId, file) => ipcRenderer.invoke('setups:fav', { carId, file }),
    delete:     (carId, files) => ipcRenderer.invoke('setups:delete', { carId, files }),
    openFolder: (id) => ipcRenderer.invoke('setups:open-folder', id)
  },
  config: {
    files:        () => ipcRenderer.invoke('config:files'),
    backup:       (name) => ipcRenderer.invoke('config:backup', name),
    backups:      () => ipcRenderer.invoke('config:backups'),
    restore:      (id) => ipcRenderer.invoke('config:restore', id),
    deleteBackup: (id) => ipcRenderer.invoke('config:backup-delete', id)
  },
  crashes: {
    list:    () => ipcRenderer.invoke('crashes:list'),
    readLog: (name) => ipcRenderer.invoke('crashes:read-log', name),
    delete:  (files) => ipcRenderer.invoke('crashes:delete', files)
  },
  replays: {
    list:       () => ipcRenderer.invoke('replays:list'),
    delete:     (files) => ipcRenderer.invoke('replays:delete', files),
    openFolder: () => ipcRenderer.invoke('replays:open-folder')
  },
  launch: {
    apps:        () => ipcRenderer.invoke('launch:apps'),
    exec:        (exePath, cwd) => ipcRenderer.invoke('launch:exec', { exePath, cwd }),
    iracingSite: () => ipcRenderer.invoke('launch:iracing-site'),
    openFolder:  (p) => ipcRenderer.invoke('launch:open-folder', p)
  },
  settings: {
    get:  () => ipcRenderer.invoke('settings:get'),
    save: (s) => ipcRenderer.invoke('settings:save', s)
  },
  autoclean: {
    preview:       () => ipcRenderer.invoke('autoclean:preview'),
    run:           () => ipcRenderer.invoke('autoclean:run'),
    runIfEnabled:  () => ipcRenderer.invoke('autoclean:run-if-enabled')
  },
  setup: {
    compare: (params) => ipcRenderer.invoke('setup:compare', params)
  },
  install: {
    find:   () => ipcRenderer.invoke('install:find'),
    set:    (p) => ipcRenderer.invoke('install:set', p),
    browse: () => ipcRenderer.invoke('install:browse'),
    scan:   (params) => ipcRenderer.invoke('install:scan', params),
    open:   (p) => ipcRenderer.invoke('install:open', p)
  },
  win: {
    minimize: () => ipcRenderer.send('win:minimize'),
    maximize: () => ipcRenderer.send('win:maximize'),
    close:    () => ipcRenderer.send('win:close')
  }
});
