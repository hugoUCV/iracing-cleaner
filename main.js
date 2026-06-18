const { app, BrowserWindow, ipcMain, shell, dialog, session, safeStorage, net } = require('electron');
const path    = require('path');
const fs      = require('fs');
const os      = require('os');
const crypto  = require('crypto');
const { execSync } = require('child_process');

let iracingCookie = null;

// Intercepta peticiones al CDN de iRacing y añade la cookie de sesión
function setupCookieInterceptor() {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://images-static.iracing.com/*'] },
    (details, callback) => {
      const headers = { ...details.requestHeaders };
      if (iracingCookie) headers['Cookie'] = iracingCookie;
      callback({ requestHeaders: headers });
    }
  );
}

// Hash requerido por iRacing: SHA-256(password + lower(email)) → base64
// El password va tal cual (case-sensitive); solo el email se pasa a minúsculas
function irHashPw(email, pw) {
  return crypto.createHash('sha256')
    .update(pw + email.toLowerCase())
    .digest('base64');
}

// Petición GET autenticada usando net.fetch (Chromium, con cookie jar de sesión)
async function irGet(url) {
  const res = await net.fetch(url, {
    headers: iracingCookie ? { Cookie: iracingCookie } : {}
  });
  const body = await res.text();
  return { status: res.status, body };
}

const IRACING_DOCS  = path.join(os.homedir(), 'Documents', 'iRacing');
const PAINT_DIR     = path.join(IRACING_DOCS, 'paint');
const TELEMETRY_DIR = path.join(IRACING_DOCS, 'telemetry');
const REPLAY_DIR    = path.join(IRACING_DOCS, 'replay');
const SETUPS_DIR    = path.join(IRACING_DOCS, 'setups');
const LOGS_DIR      = path.join(IRACING_DOCS, 'logs');
const CRASH_DIR     = IRACING_DOCS;   // .dmp/.log viven en la raíz

const CONFIG_FILES  = ['app.ini','camera.ini','controls.cfg','joyCalib.yaml','core.ini','rendererDX11.ini'];

let win;

// ── userData paths (lazy, sólo válidos tras app.whenReady) ───────────────────
function ud(rel) { return path.join(app.getPath('userData'), rel); }

function loadJSON(file, def = {}) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return def; }
}
function saveJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// ── window ───────────────────────────────────────────────────────────────────
function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 960, minHeight: 640,
    frame: false, backgroundColor: '#0f1117',
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'icon.png')
  });
  win.loadFile('index.html');
}

app.whenReady().then(() => {
  fs.mkdirSync(ud('config-backups'), { recursive: true });
  const s = getSettings();
  if (s.iracingCookie) iracingCookie = s.iracingCookie;
  setupCookieInterceptor();
  createWindow();
});
app.on('window-all-closed', () => app.quit());

// ── helpers ──────────────────────────────────────────────────────────────────
function dirStat(dirPath) {
  if (!fs.existsSync(dirPath)) return { exists: false, files: 0, bytes: 0 };
  let bytes = 0, files = 0;
  function walk(dir) {
    let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else { try { bytes += fs.statSync(full).size; files++; } catch {} }
    }
  }
  walk(dirPath);
  return { exists: true, files, bytes };
}

function isOwnPaint(filename) {
  const base = filename.replace(/\.\w+$/, '');
  return /^(car|helmet|suit|car_spec|helmet_spec|suit_spec|sponsor\d*|decal\d*)$/i.test(base);
}

function carLabel(folderName) {
  return folderName.replace(/([a-z])([A-Z0-9])/g,'$1 $2').replace(/([0-9])([a-z])/gi,'$1 $2')
    .split(' ').map(w => w.charAt(0).toUpperCase()+w.slice(1)).join(' ').trim();
}

function parseIbtName(filename) {
  const m = filename.match(/^(.+?)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}-\d{2}-\d{2})\.ibt$/i);
  if (m) return { car: m[1], date: m[2], time: m[3].replace(/-/g,':') };
  return { car: filename.replace('.ibt',''), date: null, time: null };
}

// ── IPC: disk overview ────────────────────────────────────────────────────────
ipcMain.handle('disk:overview', () => [
  { key:'paint',     label:'Paint / Skins',  path: PAINT_DIR },
  { key:'telemetry', label:'Telemetría',      path: TELEMETRY_DIR },
  { key:'replay',    label:'Replays',         path: REPLAY_DIR },
  { key:'setups',    label:'Setups',          path: SETUPS_DIR },
  { key:'logs',      label:'Logs & Crashes',  path: LOGS_DIR },
].map(f => ({ ...f, ...dirStat(f.path) })));

// ── IPC: paint ────────────────────────────────────────────────────────────────
ipcMain.handle('paint:list', () => {
  if (!fs.existsSync(PAINT_DIR)) return [];
  return fs.readdirSync(PAINT_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => {
      const carPath = path.join(PAINT_DIR, e.name);
      let files = [];
      try {
        files = fs.readdirSync(carPath, { withFileTypes: true }).filter(f=>f.isFile()).map(f => {
          const fp = path.join(carPath, f.name);
          const st = fs.statSync(fp);
          return { name: f.name, bytes: st.size, mtime: st.mtimeMs, isOwn: isOwnPaint(f.name) };
        });
      } catch {}
      const totalBytes = files.reduce((s,f)=>s+f.bytes,0);
      const dl = files.filter(f=>!f.isOwn);
      return { id:e.name, label:carLabel(e.name), files:files.length, bytes:totalBytes,
               downloadedFiles:dl.length, downloadedBytes:dl.reduce((s,f)=>s+f.bytes,0),
               ownFiles:files.filter(f=>f.isOwn).length };
    }).sort((a,b)=>b.bytes-a.bytes);
});

ipcMain.handle('paint:files', (_, carId) => {
  const carPath = path.join(PAINT_DIR, carId);
  if (!fs.existsSync(carPath)) return [];
  return fs.readdirSync(carPath,{withFileTypes:true}).filter(e=>e.isFile()).map(e => {
    const fp = path.join(carPath, e.name); const st = fs.statSync(fp);
    return { name:e.name, bytes:st.size, mtime:st.mtimeMs, isOwn:isOwnPaint(e.name) };
  }).sort((a,b)=>b.bytes-a.bytes);
});

ipcMain.handle('paint:delete', (_, {carId, files}) => deleteFiles(files.map(n=>path.join(PAINT_DIR,carId,n))));

ipcMain.handle('paint:delete-downloaded', (_, carId) => {
  const carPath = path.join(PAINT_DIR, carId);
  if (!fs.existsSync(carPath)) return { deleted:0, bytes:0, errors:[] };
  const files = fs.readdirSync(carPath,{withFileTypes:true}).filter(e=>e.isFile()&&!isOwnPaint(e.name)).map(e=>path.join(carPath,e.name));
  return deleteFiles(files);
});

ipcMain.handle('paint:delete-all-downloaded', () => {
  if (!fs.existsSync(PAINT_DIR)) return { deleted:0, bytes:0, errors:[] };
  const files = [];
  fs.readdirSync(PAINT_DIR,{withFileTypes:true}).filter(e=>e.isDirectory()).forEach(car => {
    const cp = path.join(PAINT_DIR, car.name);
    try { fs.readdirSync(cp,{withFileTypes:true}).filter(e=>e.isFile()&&!isOwnPaint(e.name)).forEach(f=>files.push(path.join(cp,f.name))); } catch {}
  });
  return deleteFiles(files);
});

// ── IPC: telemetry ────────────────────────────────────────────────────────────
ipcMain.handle('telemetry:list', () => {
  if (!fs.existsSync(TELEMETRY_DIR)) return [];
  return fs.readdirSync(TELEMETRY_DIR,{withFileTypes:true})
    .filter(e=>e.isFile()&&e.name.endsWith('.ibt'))
    .map(e => { const fp=path.join(TELEMETRY_DIR,e.name); const st=fs.statSync(fp); return {name:e.name,bytes:st.size,mtime:st.mtimeMs,...parseIbtName(e.name)}; })
    .sort((a,b)=>b.mtime-a.mtime);
});
ipcMain.handle('telemetry:delete', (_, files) => deleteFiles(files.map(n=>path.join(TELEMETRY_DIR,n))));
ipcMain.handle('telemetry:open-folder', () => shell.openPath(TELEMETRY_DIR));

// ── IPC: setups ───────────────────────────────────────────────────────────────
ipcMain.handle('setups:cars', () => {
  if (!fs.existsSync(SETUPS_DIR)) return [];
  const notes = loadJSON(ud('setup-notes.json'));
  return fs.readdirSync(SETUPS_DIR,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e => {
    const files = collectSetupFiles(path.join(SETUPS_DIR, e.name));
    const carNotes = notes[e.name] || {};
    const favs = files.filter(f => carNotes[f.name]?.fav).length;
    return { id:e.name, label:carLabel(e.name), count:files.length, favs };
  }).sort((a,b) => b.count - a.count);
});

ipcMain.handle('setups:files', (_, carId) => {
  const notes = loadJSON(ud('setup-notes.json'));
  const carNotes = notes[carId] || {};
  return collectSetupFiles(path.join(SETUPS_DIR, carId)).map(f => ({
    ...f, note: carNotes[f.name]?.note || '', fav: !!carNotes[f.name]?.fav
  }));
});

ipcMain.handle('setups:note', (_, {carId, file, note}) => {
  const data = loadJSON(ud('setup-notes.json'));
  if (!data[carId]) data[carId] = {};
  if (!data[carId][file]) data[carId][file] = {};
  data[carId][file].note = note;
  saveJSON(ud('setup-notes.json'), data);
  return true;
});

ipcMain.handle('setups:fav', (_, {carId, file}) => {
  const data = loadJSON(ud('setup-notes.json'));
  if (!data[carId]) data[carId] = {};
  if (!data[carId][file]) data[carId][file] = {};
  data[carId][file].fav = !data[carId][file].fav;
  saveJSON(ud('setup-notes.json'), data);
  return data[carId][file].fav;
});

ipcMain.handle('setups:delete', (_, {carId, files}) =>
  deleteFiles(files.map(n => path.join(SETUPS_DIR, carId, n))));

ipcMain.handle('setups:open-folder', (_, carId) =>
  shell.openPath(path.join(SETUPS_DIR, carId)));

// ── IPC: config backup ────────────────────────────────────────────────────────
ipcMain.handle('config:files', () =>
  CONFIG_FILES.map(name => {
    const fp = path.join(IRACING_DOCS, name);
    try { const st = fs.statSync(fp); return { name, exists:true, bytes:st.size, mtime:st.mtimeMs }; }
    catch { return { name, exists:false, bytes:0, mtime:0 }; }
  })
);

ipcMain.handle('config:backup', (_, name) => {
  const id = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
  const dir = ud(`config-backups/${id}`);
  fs.mkdirSync(dir, { recursive:true });
  let size = 0;
  const saved = [];
  for (const fname of CONFIG_FILES) {
    const src = path.join(IRACING_DOCS, fname);
    if (fs.existsSync(src)) {
      const bytes = fs.statSync(src).size;
      fs.copyFileSync(src, path.join(dir, fname));
      saved.push(fname); size += bytes;
    }
  }
  const meta = loadJSON(ud('config-backups/index.json'), { backups:[] });
  meta.backups.unshift({ id, name: name||`Backup ${new Date().toLocaleString('es-ES')}`, date:Date.now(), size, files:saved });
  saveJSON(ud('config-backups/index.json'), meta);
  return { id, size, files:saved };
});

ipcMain.handle('config:backups', () => loadJSON(ud('config-backups/index.json'), { backups:[] }).backups);

ipcMain.handle('config:restore', (_, id) => {
  const dir = ud(`config-backups/${id}`);
  if (!fs.existsSync(dir)) return { ok:false, error:'Backup no encontrado' };
  const restored = [];
  for (const fname of fs.readdirSync(dir)) {
    const dst = path.join(IRACING_DOCS, fname);
    fs.copyFileSync(path.join(dir, fname), dst);
    restored.push(fname);
  }
  return { ok:true, files:restored };
});

ipcMain.handle('config:backup-delete', (_, id) => {
  const dir = ud(`config-backups/${id}`);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive:true, force:true });
  const meta = loadJSON(ud('config-backups/index.json'), { backups:[] });
  meta.backups = meta.backups.filter(b => b.id !== id);
  saveJSON(ud('config-backups/index.json'), meta);
  return true;
});

// ── IPC: crashes ──────────────────────────────────────────────────────────────
ipcMain.handle('crashes:list', () => {
  if (!fs.existsSync(CRASH_DIR)) return [];
  const entries = fs.readdirSync(CRASH_DIR, { withFileTypes:true }).filter(e=>e.isFile());
  const dmps = entries.filter(e=>e.name.endsWith('.dmp'));
  return dmps.map(e => {
    const base = e.name.replace('.dmp','');
    const logName = base + '.log';
    const dmpPath = path.join(CRASH_DIR, e.name);
    const logPath = path.join(CRASH_DIR, logName);
    const st = fs.statSync(dmpPath);
    const logExists = fs.existsSync(logPath);
    return {
      base, dmp:e.name, log: logExists ? logName : null,
      bytes: st.size + (logExists ? fs.statSync(logPath).size : 0),
      mtime: st.mtimeMs
    };
  }).sort((a,b)=>b.mtime-a.mtime);
});

ipcMain.handle('crashes:read-log', (_, logName) => {
  const fp = path.join(CRASH_DIR, logName);
  if (!fs.existsSync(fp)) return '';
  const lines = fs.readFileSync(fp,'utf8').split('\n');
  return lines.slice(0, 80).join('\n');
});

ipcMain.handle('crashes:delete', (_, files) => deleteFiles(files.map(n=>path.join(CRASH_DIR,n))));

// ── IPC: replays ──────────────────────────────────────────────────────────────
ipcMain.handle('replays:list', () => {
  if (!fs.existsSync(REPLAY_DIR)) return [];
  return fs.readdirSync(REPLAY_DIR, { withFileTypes:true })
    .filter(e=>e.isFile())
    .map(e => {
      const fp = path.join(REPLAY_DIR, e.name);
      const st = fs.statSync(fp);
      const m = e.name.match(/^(.+?)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}-\d{2}-\d{2})/i);
      return { name:e.name, bytes:st.size, mtime:st.mtimeMs,
               session: m?.[1] || e.name, date:m?.[2]||null, time:m?.[3]||null };
    }).sort((a,b)=>b.mtime-a.mtime);
});
ipcMain.handle('replays:delete', (_, files) => deleteFiles(files.map(n=>path.join(REPLAY_DIR,n))));
ipcMain.handle('replays:open-folder', () => shell.openPath(REPLAY_DIR));

// ── IPC: quick launch ─────────────────────────────────────────────────────────
const KNOWN_APPS = [
  { id:'iracing-ui',  label:'iRacing UI',       icon:'🏎',  paths:['C:\\iRacing\\iRacingUI.exe','D:\\iRacing\\iRacingUI.exe'] },
  { id:'iracing-sim', label:'iRacing Sim',       icon:'🏁',  paths:['C:\\iRacing\\iracingsim64DX11.exe','D:\\iRacing\\iracingsim64DX11.exe'] },
  { id:'simhub',      label:'SimHub',            icon:'📊',  paths:['C:\\Program Files\\SimHub\\SimHubWPF.exe','C:\\Users\\'+os.userInfo().username+'\\AppData\\Local\\SimHub\\SimHubWPF.exe'] },
  { id:'tradingpaints',label:'Trading Paints',   icon:'🎨',  paths:['C:\\Users\\'+os.userInfo().username+'\\AppData\\Local\\Programs\\TradingPaints\\Trading Paints.exe'] },
  { id:'moza',        label:'MOZA Pit House',    icon:'🎮',  paths:['C:\\Program Files\\MOZA\\MOZA Pit House\\MOZA Pit House.exe'] },
  { id:'corner-coach',label:'Corner Coach',      icon:'📈',  paths:['C:\\Users\\'+os.userInfo().username+'\\Documents\\iracing-corner-coach\\node_modules\\electron\\dist\\electron.exe'] },
  { id:'manager',     label:'iRacing Manager',   icon:'📅',  paths:['C:\\Users\\'+os.userInfo().username+'\\Documents\\iracing-manager\\node_modules\\electron\\dist\\electron.exe'] },
  { id:'livery',      label:'Livery Creator',    icon:'🖌',  paths:['C:\\Users\\'+os.userInfo().username+'\\Documents\\iracing-livery-creator\\node_modules\\electron\\dist\\electron.exe'] },
  { id:'photo-tool',  label:'Photo Tool',        icon:'📷',  paths:['C:\\Users\\'+os.userInfo().username+'\\Documents\\iracing-photo-tool\\node_modules\\electron\\dist\\electron.exe'] },
];

ipcMain.handle('launch:apps', () =>
  KNOWN_APPS.map(a => ({
    ...a,
    exePath: a.paths.find(p=>fs.existsSync(p)) || null,
    available: a.paths.some(p=>fs.existsSync(p))
  }))
);

ipcMain.handle('launch:exec', (_, {exePath, cwd}) => {
  if (!exePath || !fs.existsSync(exePath)) return { ok:false };
  try {
    const { spawn } = require('child_process');
    const workDir = cwd || path.dirname(exePath);
    spawn(exePath, [], { detached:true, stdio:'ignore', cwd:workDir }).unref();
    return { ok:true };
  } catch(e) { return { ok:false, error:e.message }; }
});

ipcMain.handle('launch:iracing-site', () => shell.openExternal('https://members.iracing.com'));
ipcMain.handle('launch:open-folder', (_, p) => shell.openPath(p));

// ── IPC: win controls ─────────────────────────────────────────────────────────
ipcMain.on('win:minimize', () => win?.minimize());
ipcMain.on('win:maximize', () => win?.isMaximized() ? win.unmaximize() : win.maximize());
ipcMain.on('win:close', () => win?.close());

// ── Settings ──────────────────────────────────────────────────────────────────
function getSettings() { return loadJSON(ud('settings.json'), {}); }
function saveSettings(s) { saveJSON(ud('settings.json'), s); }
ipcMain.handle('settings:get', () => getSettings());
ipcMain.handle('settings:save', (_, s) => { saveSettings(s); return true; });

// ── Auto-cleanup ──────────────────────────────────────────────────────────────
function computeAutoClean(ac) {
  const now = Date.now();
  const r = { telemetry: [], paint: [], replays: [] };

  const telDays = Math.max(0, parseInt(ac.telemetryDays) || 0);
  if (telDays > 0 && fs.existsSync(TELEMETRY_DIR)) {
    const cut = now - telDays * 86400000;
    try {
      for (const e of fs.readdirSync(TELEMETRY_DIR, { withFileTypes: true })) {
        if (!e.isFile() || !e.name.endsWith('.ibt')) continue;
        try { const st = fs.statSync(path.join(TELEMETRY_DIR, e.name)); if (st.mtimeMs < cut) r.telemetry.push({ name: e.name, bytes: st.size, mtime: st.mtimeMs }); } catch {}
      }
    } catch {}
  }

  const paintDays = Math.max(0, parseInt(ac.paintDays) || 0);
  if (paintDays > 0 && fs.existsSync(PAINT_DIR)) {
    const cut = now - paintDays * 86400000;
    try {
      for (const car of fs.readdirSync(PAINT_DIR, { withFileTypes: true }).filter(e => e.isDirectory())) {
        const cp = path.join(PAINT_DIR, car.name);
        try {
          for (const f of fs.readdirSync(cp, { withFileTypes: true }).filter(e => e.isFile())) {
            if (isOwnPaint(f.name)) continue;
            try { const st = fs.statSync(path.join(cp, f.name)); if (st.mtimeMs < cut) r.paint.push({ name: `${car.name}/${f.name}`, car: car.name, file: f.name, bytes: st.size, mtime: st.mtimeMs }); } catch {}
          }
        } catch {}
      }
    } catch {}
  }

  const repDays = Math.max(0, parseInt(ac.replayDays) || 0);
  if (repDays > 0 && fs.existsSync(REPLAY_DIR)) {
    const cut = now - repDays * 86400000;
    try {
      for (const e of fs.readdirSync(REPLAY_DIR, { withFileTypes: true })) {
        if (!e.isFile()) continue;
        try { const st = fs.statSync(path.join(REPLAY_DIR, e.name)); if (st.mtimeMs < cut) r.replays.push({ name: e.name, bytes: st.size, mtime: st.mtimeMs }); } catch {}
      }
    } catch {}
  }

  return r;
}

async function doAutoClean(preview) {
  const res = {};
  if (preview.telemetry.length) res.telemetry = deleteFiles(preview.telemetry.map(f => path.join(TELEMETRY_DIR, f.name)));
  if (preview.paint.length)     res.paint     = deleteFiles(preview.paint.map(f => path.join(PAINT_DIR, f.car, f.file)));
  if (preview.replays.length)   res.replays   = deleteFiles(preview.replays.map(f => path.join(REPLAY_DIR, f.name)));
  return res;
}

ipcMain.handle('autoclean:preview', () => computeAutoClean(getSettings().autoClean || {}));
ipcMain.handle('autoclean:run',     () => doAutoClean(computeAutoClean(getSettings().autoClean || {})));

ipcMain.handle('autoclean:run-if-enabled', async () => {
  const s = getSettings();
  const ac = s.autoClean || {};
  if (!ac.enabled) return null;
  const today = new Date().toDateString();
  if (s.lastAutoClean === today) return null;
  const preview = computeAutoClean(ac);
  const total = preview.telemetry.length + preview.paint.length + preview.replays.length;
  if (!total) { saveSettings({ ...s, lastAutoClean: today }); return null; }
  const results = await doAutoClean(preview);
  saveSettings({ ...s, lastAutoClean: today });
  return results;
});

// ── Setup compare ─────────────────────────────────────────────────────────────
function extractEmbeddedText(buf) {
  let result = '', run = '';
  for (let i = 0; i + 1 < buf.length; i++) {
    const lo = buf[i], hi = buf[i + 1];
    if (lo >= 0x20 && lo < 0x7F && hi === 0x00) {
      run += String.fromCharCode(lo); i++;
    } else {
      if (run.length >= 12 && /[a-zA-Z]{4}/.test(run)) result += (result ? '\n' : '') + run.trim();
      run = '';
    }
  }
  if (run.length >= 12 && /[a-zA-Z]{4}/.test(run)) result += (result ? '\n' : '') + run.trim();
  return result.slice(0, 2000);
}

ipcMain.handle('setup:compare', (_, { carId, names }) => {
  const notes = loadJSON(ud('setup-notes.json'));
  const cn = notes[carId] || {};
  return names.map(fname => {
    const fp = path.join(SETUPS_DIR, carId, fname);
    try {
      const buf = fs.readFileSync(fp);
      const st  = fs.statSync(fp);
      return { name: fname, size: buf.length, mtime: st.mtimeMs, text: extractEmbeddedText(buf), note: cn[fname]?.note || '', fav: !!cn[fname]?.fav };
    } catch(e) {
      return { name: fname, size: 0, mtime: 0, text: '', note: cn[fname]?.note || '', fav: false, error: e.message };
    }
  });
});

// ── Install scanner ───────────────────────────────────────────────────────────
ipcMain.handle('install:find', () => {
  const s = getSettings();
  if (s.iracingInstallPath && fs.existsSync(s.iracingInstallPath)) return { path: s.iracingInstallPath, found: true, source: 'saved' };

  const common = ['C:\\iRacing','D:\\iRacing','E:\\iRacing','C:\\Program Files\\iRacing','C:\\Program Files (x86)\\iRacing'];
  for (const p of common) {
    if (fs.existsSync(path.join(p, 'iracingsim64DX11.exe'))) {
      saveSettings({ ...getSettings(), iracingInstallPath: p });
      return { path: p, found: true, source: 'auto' };
    }
  }

  try {
    const out = execSync(
      'powershell -NoProfile -NonInteractive -Command "try{(Get-ItemProperty HKLM:\\SOFTWARE\\WOW6432Node\\iRacing.com\\iRacing -EA Stop).Path}catch{}"',
      { timeout: 3000, encoding: 'utf8' }
    ).trim();
    if (out && fs.existsSync(out)) { saveSettings({ ...getSettings(), iracingInstallPath: out }); return { path: out, found: true, source: 'registry' }; }
  } catch {}

  return { path: null, found: false };
});

ipcMain.handle('install:set', (_, p) => {
  if (fs.existsSync(p)) { saveSettings({ ...getSettings(), iracingInstallPath: p }); return { ok: true }; }
  return { ok: false, error: 'Ruta no existe' };
});

ipcMain.handle('install:browse', async () => {
  const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'], title: 'Carpeta de instalación de iRacing', defaultPath: 'C:\\' });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('install:scan', (_, { installPath, type }) => {
  const dir = path.join(installPath, type);
  if (!fs.existsSync(dir)) return [];
  const items = [];
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const { bytes, files } = dirStat(path.join(dir, e.name));
      items.push({ id: e.name, label: carLabel(e.name), bytes, files });
    }
  } catch {}
  return items.sort((a, b) => b.bytes - a.bytes);
});

ipcMain.handle('install:open', (_, p) => shell.openPath(p));

// ── helpers privados ──────────────────────────────────────────────────────────
function deleteFiles(paths) {
  const r = { deleted:0, bytes:0, errors:[] };
  for (const fp of paths) {
    try { const sz = fs.statSync(fp).size; fs.unlinkSync(fp); r.deleted++; r.bytes+=sz; }
    catch { r.errors.push(path.basename(fp)); }
  }
  return r;
}

function collectSetupFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const files = [];
  function walk(dir, rel) {
    try {
      for (const e of fs.readdirSync(dir,{withFileTypes:true})) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { walk(full, rel ? `${rel}/${e.name}` : e.name); }
        else if (e.name.endsWith('.sto') || e.name.endsWith('.htm')) {
          const st = fs.statSync(full);
          files.push({ name:e.name, rel: rel ? `${rel}/${e.name}` : e.name,
                       bytes:st.size, mtime:st.mtimeMs, track:guessTrack(e.name) });
        }
      }
    } catch {}
  }
  walk(dirPath, '');
  return files.sort((a,b)=>b.mtime-a.mtime);
}

function guessTrack(filename) {
  const known = ['spa','silverstone','monza','nurburgring','le mans','lemans','daytona','sebring',
    'watkins glen','imola','barcelona','zandvoort','brands hatch','interlagos','bahrain','mount panorama',
    'bathurst','fuji','suzuka','laguna seca','okayama','long beach','road america','road atlanta',
    'virginia','lime rock','sonoma','mid ohio','mosport','mosport','charlotte','talladega','dover',
    'phoenix','bristol','michigan','pocono','iowa','richmond','martinsville','kentucky','chicago'];
  const low = filename.toLowerCase();
  return known.find(t => low.includes(t.replace(' ',''))) || null;
}

// ── iRacing auth ─────────────────────────────────────────────────────────────

ipcMain.handle('iracing:login', () => {
  return new Promise((resolve) => {
    const authWin = new BrowserWindow({
      width: 960, height: 720,
      title: 'iRacing — Inicia sesión',
      autoHideMenuBar: true,
      webPreferences: { session: session.defaultSession, nodeIntegration: false, contextIsolation: true }
    });

    authWin.loadURL('https://members-ng.iracing.com/');

    let done = false;

    async function onCookieSet(event, cookie, cause, removed) {
      if (done || removed || cookie.name !== 'irsso_membersv3') return;
      if (!cookie.domain.includes('iracing.com')) return;
      done = true;
      session.defaultSession.cookies.removeListener('changed', onCookieSet);
      iracingCookie = `irsso_membersv3=${cookie.value}`;

      // Intenta obtener el email/nombre del miembro
      let memberInfo = {};
      try {
        const r1 = await net.fetch('https://members-ng.iracing.com/data/member/info', {
          headers: { Cookie: iracingCookie }
        });
        const d1 = JSON.parse(await r1.text());
        if (d1.link) {
          const r2 = await net.fetch(d1.link);
          const d2 = JSON.parse(await r2.text());
          memberInfo = { email: d2.email || '', name: d2.display_name || '' };
        }
      } catch {}

      const s = getSettings();
      s.iracingAccount = memberInfo;
      s.iracingCookie  = iracingCookie;
      saveSettings(s);

      setTimeout(() => { try { authWin.close(); } catch {} }, 400);
      resolve({ ok: true, ...memberInfo });
    }

    session.defaultSession.cookies.on('changed', onCookieSet);

    authWin.on('closed', () => {
      session.defaultSession.cookies.removeListener('changed', onCookieSet);
      if (!done) {
        done = true;
        resolve({ ok: false, error: 'Ventana cerrada sin iniciar sesión' });
      }
    });
  });
});

ipcMain.handle('iracing:logout', async () => {
  iracingCookie = null;
  await session.defaultSession.cookies.remove('https://members-ng.iracing.com', 'irsso_membersv3').catch(() => {});
  const s = getSettings();
  delete s.iracingAccount;
  delete s.iracingCookie;
  saveSettings(s);
  return true;
});

ipcMain.handle('iracing:status', () => {
  const s = getSettings();
  return {
    loggedIn: !!iracingCookie,
    email: s.iracingAccount?.email || null,
    name:  s.iracingAccount?.name  || null
  };
});

ipcMain.handle('iracing:fetch-assets', async (_, type) => {
  if (!iracingCookie) return { ok: false, error: 'No autenticado' };
  try {
    const ep   = type === 'tracks' ? '/data/track/assets' : '/data/car/assets';
    const res1 = await irGet(`https://members-ng.iracing.com${ep}`);

    // Maneja expiración de cookie
    if (res1.status === 401 || res1.status === 403) {
      iracingCookie = null;
      return { ok: false, error: 'Sesión expirada — vuelve a conectar' };
    }

    const linkData = JSON.parse(res1.body);
    if (!linkData.link) return { ok: false, error: 'API sin link — intenta de nuevo' };

    const res2   = await irGet(linkData.link);
    const assets = JSON.parse(res2.body);

    const map = {};
    for (const asset of Object.values(assets)) {
      const folder = asset.folder;
      if (!folder) continue;
      let img = null;
      if (type === 'tracks') {
        img = asset.track_map || (asset.track_map_layers && asset.track_map_layers['0']) || null;
      } else {
        img = asset.small_image || asset.logo || null;
      }
      if (img) map[folder] = `https://images-static.iracing.com/${img}`;
    }

    saveJSON(ud(`${type}-images.json`), { map, ts: Date.now() });
    return { ok: true, count: Object.keys(map).length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('iracing:cached-assets', (_, type) => {
  return loadJSON(ud(`${type}-images.json`), { map: {}, ts: 0 });
});
