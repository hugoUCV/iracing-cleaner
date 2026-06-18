const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const IRACING_DOCS = path.join(os.homedir(), 'Documents', 'iRacing');
const PAINT_DIR = path.join(IRACING_DOCS, 'paint');
const TELEMETRY_DIR = path.join(IRACING_DOCS, 'telemetry');
const REPLAY_DIR = path.join(IRACING_DOCS, 'replay');
const SETUPS_DIR = path.join(IRACING_DOCS, 'setups');
const LOGS_DIR = path.join(IRACING_DOCS, 'logs');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0f1117',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'icon.png')
  });
  win.loadFile('index.html');
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ── helpers ──────────────────────────────────────────────────────────────────

function dirStat(dirPath) {
  if (!fs.existsSync(dirPath)) return { exists: false, files: 0, bytes: 0 };
  let bytes = 0, files = 0;
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); }
      else { try { bytes += fs.statSync(full).size; files++; } catch {} }
    }
  }
  walk(dirPath);
  return { exists: true, files, bytes };
}

function formatBytes(b) {
  if (b >= 1e9) return (b / 1e9).toFixed(1) + ' GB';
  if (b >= 1e6) return (b / 1e6).toFixed(1) + ' MB';
  if (b >= 1e3) return (b / 1e3).toFixed(1) + ' KB';
  return b + ' B';
}

// ── IPC: disk overview ────────────────────────────────────────────────────────

ipcMain.handle('disk:overview', () => {
  const folders = [
    { key: 'paint',     label: 'Paint / Skins',   path: PAINT_DIR },
    { key: 'telemetry', label: 'Telemetría',        path: TELEMETRY_DIR },
    { key: 'replay',    label: 'Replays',           path: REPLAY_DIR },
    { key: 'setups',    label: 'Setups',            path: SETUPS_DIR },
    { key: 'logs',      label: 'Logs & Crashes',    path: LOGS_DIR },
  ];
  return folders.map(f => ({ ...f, ...dirStat(f.path) }));
});

// ── IPC: paint ────────────────────────────────────────────────────────────────

ipcMain.handle('paint:list', () => {
  if (!fs.existsSync(PAINT_DIR)) return [];
  const cars = fs.readdirSync(PAINT_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => {
      const carPath = path.join(PAINT_DIR, e.name);
      let files = [];
      try {
        files = fs.readdirSync(carPath, { withFileTypes: true })
          .filter(f => f.isFile())
          .map(f => {
            const fp = path.join(carPath, f.name);
            const stat = fs.statSync(fp);
            return {
              name: f.name,
              bytes: stat.size,
              mtime: stat.mtimeMs,
              isOwn: isOwnPaint(f.name)
            };
          });
      } catch {}
      const totalBytes = files.reduce((s, f) => s + f.bytes, 0);
      const downloadedBytes = files.filter(f => !f.isOwn).reduce((s, f) => s + f.bytes, 0);
      return {
        id: e.name,
        label: carLabel(e.name),
        files: files.length,
        bytes: totalBytes,
        downloadedFiles: files.filter(f => !f.isOwn).length,
        downloadedBytes,
        ownFiles: files.filter(f => f.isOwn).length
      };
    })
    .sort((a, b) => b.bytes - a.bytes);
  return cars;
});

ipcMain.handle('paint:files', (_, carId) => {
  const carPath = path.join(PAINT_DIR, carId);
  if (!fs.existsSync(carPath)) return [];
  return fs.readdirSync(carPath, { withFileTypes: true })
    .filter(e => e.isFile())
    .map(e => {
      const fp = path.join(carPath, e.name);
      const stat = fs.statSync(fp);
      return { name: e.name, bytes: stat.size, mtime: stat.mtimeMs, isOwn: isOwnPaint(e.name) };
    })
    .sort((a, b) => b.bytes - a.bytes);
});

ipcMain.handle('paint:delete', async (_, { carId, files }) => {
  const results = { deleted: 0, bytes: 0, errors: [] };
  for (const name of files) {
    const fp = path.join(PAINT_DIR, carId, name);
    try {
      const size = fs.statSync(fp).size;
      fs.unlinkSync(fp);
      results.deleted++;
      results.bytes += size;
    } catch (e) {
      results.errors.push(name);
    }
  }
  return results;
});

ipcMain.handle('paint:delete-downloaded', async (_, carId) => {
  const carPath = path.join(PAINT_DIR, carId);
  const results = { deleted: 0, bytes: 0, errors: [] };
  if (!fs.existsSync(carPath)) return results;
  const files = fs.readdirSync(carPath, { withFileTypes: true }).filter(e => e.isFile());
  for (const f of files) {
    if (!isOwnPaint(f.name)) {
      const fp = path.join(carPath, f.name);
      try {
        const size = fs.statSync(fp).size;
        fs.unlinkSync(fp);
        results.deleted++;
        results.bytes += size;
      } catch { results.errors.push(f.name); }
    }
  }
  return results;
});

ipcMain.handle('paint:delete-all-downloaded', async () => {
  if (!fs.existsSync(PAINT_DIR)) return { deleted: 0, bytes: 0, errors: [] };
  const results = { deleted: 0, bytes: 0, errors: [] };
  const cars = fs.readdirSync(PAINT_DIR, { withFileTypes: true }).filter(e => e.isDirectory());
  for (const car of cars) {
    const carPath = path.join(PAINT_DIR, car.name);
    const files = fs.readdirSync(carPath, { withFileTypes: true }).filter(e => e.isFile());
    for (const f of files) {
      if (!isOwnPaint(f.name)) {
        const fp = path.join(carPath, f.name);
        try {
          const size = fs.statSync(fp).size;
          fs.unlinkSync(fp);
          results.deleted++;
          results.bytes += size;
        } catch { results.errors.push(f.name); }
      }
    }
  }
  return results;
});

// ── IPC: telemetry ────────────────────────────────────────────────────────────

ipcMain.handle('telemetry:list', () => {
  if (!fs.existsSync(TELEMETRY_DIR)) return [];
  const files = fs.readdirSync(TELEMETRY_DIR, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.ibt'))
    .map(e => {
      const fp = path.join(TELEMETRY_DIR, e.name);
      const stat = fs.statSync(fp);
      const parsed = parseIbtName(e.name);
      return { name: e.name, bytes: stat.size, mtime: stat.mtimeMs, ...parsed };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return files;
});

ipcMain.handle('telemetry:delete', async (_, files) => {
  const results = { deleted: 0, bytes: 0, errors: [] };
  for (const name of files) {
    const fp = path.join(TELEMETRY_DIR, name);
    try {
      const size = fs.statSync(fp).size;
      fs.unlinkSync(fp);
      results.deleted++;
      results.bytes += size;
    } catch { results.errors.push(name); }
  }
  return results;
});

ipcMain.handle('telemetry:open-folder', () => {
  shell.openPath(TELEMETRY_DIR);
});

// ── IPC: window controls ──────────────────────────────────────────────────────

ipcMain.on('win:minimize', () => win?.minimize());
ipcMain.on('win:maximize', () => win?.isMaximized() ? win.unmaximize() : win.maximize());
ipcMain.on('win:close', () => win?.close());

// ── helpers privados ──────────────────────────────────────────────────────────

function isOwnPaint(filename) {
  // iRacing usa car_{custId}.tga para skins descargadas.
  // Los archivos "propios" son car.tga / car_spec.tga / helmet.tga / suit.tga
  const base = filename.replace(/\.\w+$/, '');
  const ownPatterns = /^(car|helmet|suit|car_spec|helmet_spec|suit_spec|sponsor\d*|decal\d*)$/i;
  return ownPatterns.test(base);
}

function carLabel(folderName) {
  return folderName
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/([0-9])([a-z])/gi, '$1 $2')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .trim();
}

function parseIbtName(filename) {
  // formato típico: "car track YYYY-MM-DD HH-MM-SS.ibt"
  const m = filename.match(/^(.+?)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}-\d{2}-\d{2})\.ibt$/i);
  if (m) return { car: m[1], date: m[2], time: m[3].replace(/-/g, ':') };
  return { car: filename.replace('.ibt', ''), date: null, time: null };
}
