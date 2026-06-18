// ── state ──────────────────────────────────────────────────────────────────────
let paintData = [], telemetryData = [], replayData = [], setupCars = [], setupFiles = [];
let selectedSetupCar = null, activeCrash = null;

// ── init ───────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setupNav();
  buildProgressOverlay();
  buildNoteOverlay();
  buildDetailPanel();
  buildCompareOverlay();
  buildLoginOverlay();
  showView('overview');

  const acResult = await api.autoclean.runIfEnabled();
  if (acResult) {
    let deleted = 0, bytes = 0;
    for (const r of Object.values(acResult)) { deleted += r.deleted || 0; bytes += r.bytes || 0; }
    if (deleted > 0) toast(`⚡ Auto-limpieza: ${deleted} archivos · ${fmtB(bytes)} liberados`, 'success');
  }
});

function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      showView(btn.dataset.view);
    });
  });
}

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${name}`).classList.add('active');
  closeDetail();
  closeCompare();
  ({
    overview, paint: renderPaint, telemetry: renderTelemetry, replays: renderReplays,
    setups: renderSetups, configs: renderConfigs, crashes: renderCrashes, launch: renderLaunch,
    auto: renderAutoClean, install: renderInstall
  })[name]?.();
}

function navTo(view) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  showView(view);
}

// ═══════════════════════════════════════════════════════════════════════════════
// OVERVIEW
// ═══════════════════════════════════════════════════════════════════════════════
async function overview() {
  const el = eid('view-overview');
  el.innerHTML = loading('Escaneando…');
  const data = await api.disk.overview();
  const total = data.reduce((s, f) => s + f.bytes, 0);
  const cleanable = data.filter(f => ['paint','telemetry','logs'].includes(f.key)).reduce((s,f) => s+f.bytes, 0);

  const SEG_COLORS = { paint:'#F5C400', telemetry:'#4B8EF5', replay:'#22C55E', setups:'#A855F7', logs:'#EF4444' };
  const ICONS      = { paint:'🎨', telemetry:'📈', replay:'🎬', setups:'🔧', logs:'💥' };
  const NAV        = { paint:'paint', telemetry:'telemetry', replay:'replays', setups:'setups' };

  el.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Disco</div><div class="page-subtitle">Resumen de tu carpeta iRacing</div></div>
      <div class="header-actions"><button class="btn btn-ghost" onclick="overview()">↻ Actualizar</button></div>
    </div>

    <div class="card" style="padding:24px 28px">
      <div style="display:flex;align-items:baseline;gap:14px;flex-wrap:wrap">
        <div class="metric-big">${fmtB(total)}</div>
        <div style="color:var(--t2);font-size:13px;padding-bottom:4px">total en iRacing Documents</div>
        <div style="margin-left:auto;text-align:right">
          <div style="font-size:22px;font-weight:700;color:var(--yellow);font-variant-numeric:tabular-nums">${fmtB(cleanable)}</div>
          <div style="font-size:10px;color:var(--t2);margin-top:1px">recuperables ahora</div>
        </div>
      </div>
      <div class="overview-bar" style="margin-top:18px">
        ${data.filter(f => f.bytes > 0).map(f =>
          `<div class="bar-seg" style="width:${(f.bytes/total*100).toFixed(2)}%;background:${SEG_COLORS[f.key]};opacity:.85"></div>`
        ).join('')}
      </div>
      <div style="display:flex;gap:18px;margin-top:10px;flex-wrap:wrap">
        ${data.filter(f => f.bytes > 0).map(f =>
          `<div style="display:flex;align-items:center;gap:5px">
            <div style="width:8px;height:8px;border-radius:2px;background:${SEG_COLORS[f.key]};flex-shrink:0"></div>
            <span style="font-size:11px;color:var(--t2)">${f.label}</span>
            <span style="font-size:11px;font-weight:700;font-variant-numeric:tabular-nums">${fmtB(f.bytes)}</span>
          </div>`
        ).join('')}
      </div>
    </div>

    <div class="disk-grid">
      ${data.map(f => {
        const pct = total > 0 ? f.bytes / total * 100 : 0;
        const sizeColor = f.bytes > 5e9 ? 'var(--yellow)' : f.bytes > 1e9 ? 'var(--text)' : 'var(--t2)';
        const nav = NAV[f.key];
        return `
          <div class="disk-card" ${nav ? `data-nav="${nav}" onclick="navTo('${nav}')"` : ''}>
            <div class="disk-card-icon">${ICONS[f.key] || '📁'}</div>
            <div class="disk-card-size" style="color:${sizeColor}">${fmtB(f.bytes)}</div>
            <div class="disk-card-label">${f.label}</div>
            <div class="disk-card-meta">${f.files.toLocaleString()} archivos${!f.exists ? ' · no encontrada' : ''}</div>
            <div style="height:2px;background:var(--b1);border-radius:1px;margin-top:12px;overflow:hidden">
              <div style="height:100%;width:${pct.toFixed(1)}%;background:${SEG_COLORS[f.key]};border-radius:1px;opacity:.7"></div>
            </div>
          </div>`;
      }).join('')}
    </div>

    <div class="card" style="padding:0;overflow:hidden">
      <div style="padding:14px 20px;border-bottom:1px solid var(--b1)">
        <div class="card-title" style="margin:0">Qué puedes limpiar ahora mismo</div>
      </div>
      ${[
        { key:'paint',     label:'Paint / Skins',    tip:'Skins descargadas por Trading Paints — se regeneran solas la próxima carrera',   nav:'paint' },
        { key:'telemetry', label:'Telemetría (.ibt)', tip:'Sesiones pasadas que ya no necesitas — bórralas sin perder nada importante',       nav:'telemetry' },
        { key:'logs',      label:'Crash Logs',        tip:'Archivos .dmp y .log de crashes — se pueden borrar sin ningún riesgo',              nav:'crashes' },
      ].map(item => {
        const f = data.find(d => d.key === item.key);
        if (!f || !f.exists || f.bytes === 0) return '';
        return `<div style="display:flex;align-items:center;gap:14px;padding:14px 20px;border-bottom:1px solid var(--b1);cursor:pointer" onclick="navTo('${item.nav}')"
                     onmouseenter="this.style.background='var(--s2)'" onmouseleave="this.style.background=''">
          <div style="flex:1">
            <div style="font-size:12px;font-weight:600">${item.label}</div>
            <div style="font-size:11px;color:var(--t2);margin-top:2px">${item.tip}</div>
          </div>
          <div style="font-size:16px;font-weight:700;color:var(--yellow);font-variant-numeric:tabular-nums;white-space:nowrap">${fmtB(f.bytes)}</div>
          <div style="color:var(--t3);font-size:14px">›</div>
        </div>`;
      }).join('')}
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAINT
// ═══════════════════════════════════════════════════════════════════════════════
async function renderPaint() {
  const el = eid('view-paint');
  el.innerHTML = loading('Escaneando skins…');
  paintData = await api.paint.list();
  const totalB = paintData.reduce((s, c) => s + c.bytes, 0);
  const dlB    = paintData.reduce((s, c) => s + c.downloadedBytes, 0);
  const dlF    = paintData.reduce((s, c) => s + c.downloadedFiles, 0);
  const ownF   = paintData.reduce((s, c) => s + c.ownFiles, 0);

  el.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Paint / Skins</div><div class="page-subtitle">${paintData.length} coches · ${fmtB(totalB)} total</div></div>
      <div class="header-actions">
        <button class="btn btn-danger" onclick="cleanAllDownloaded()">Limpiar todo descargado</button>
      </div>
    </div>
    <div class="card" style="padding:20px 24px">
      <div class="stat-strip">
        <div class="stat-item"><div class="sv sv-yellow">${fmtB(dlB)}</div><div class="sl">espacio recuperable</div></div>
        <div style="width:1px;background:var(--b1);margin:4px 0"></div>
        <div class="stat-item"><div class="sv sv-red">${dlF.toLocaleString()}</div><div class="sl">skins descargadas</div></div>
        <div class="stat-item"><div class="sv sv-muted">${ownF.toLocaleString()}</div><div class="sl">propias (protegidas)</div></div>
      </div>
    </div>
    <div class="table-wrap">
      <div class="toolbar">
        <input class="search-input" id="paint-search" placeholder="Buscar coche…" oninput="filterPaint()" style="width:200px">
        <select class="sort-select" id="paint-sort" onchange="filterPaint()">
          <option value="size">Mayor tamaño</option>
          <option value="downloaded">Más descargadas</option>
          <option value="name">Nombre A–Z</option>
        </select>
      </div>
      <div id="paint-table-wrap" style="flex:1;overflow-y:auto">${buildPaintTable(paintData)}</div>
    </div>`;
}

function buildPaintTable(cars) {
  if (!cars.length) return emptyState('🎨', 'No se encontraron skins');
  return `<table class="data-table">
    <thead><tr>
      <th>Coche</th><th>Total</th><th>Descargadas</th><th>Recuperable</th><th></th>
    </tr></thead>
    <tbody>${cars.map(c => `
      <tr style="cursor:pointer" onclick="openDetail('${c.id}')">
        <td><div class="car-name">${c.label}</div><div class="file-count">${c.files} archivos · ${c.ownFiles} propios</div></td>
        <td class="num" style="color:var(--t2)">${fmtB(c.bytes)}</td>
        <td class="num">${c.downloadedFiles > 0 ? `<span style="color:var(--red)">${c.downloadedFiles}</span>` : '<span style="color:var(--t3)">—</span>'}</td>
        <td class="num">${c.downloadedBytes > 0 ? `<span style="color:var(--yellow);font-weight:700">${fmtB(c.downloadedBytes)}</span>` : '<span style="color:var(--t3)">—</span>'}</td>
        <td>${c.downloadedFiles > 0
          ? `<button class="btn btn-xs btn-danger" onclick="event.stopPropagation();cleanCar('${c.id}')">Limpiar</button>`
          : `<span class="tag tag-green">Limpio</span>`}</td>
      </tr>`).join('')}
    </tbody></table>`;
}

function filterPaint() {
  const q = eid('paint-search').value.toLowerCase();
  const s = eid('paint-sort').value;
  let r = paintData.filter(c => c.label.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
  r.sort(s === 'size' ? (a,b) => b.bytes-a.bytes : s === 'downloaded' ? (a,b) => b.downloadedFiles-a.downloadedFiles : (a,b) => a.label.localeCompare(b.label));
  eid('paint-table-wrap').innerHTML = buildPaintTable(r);
}

async function cleanCar(carId) {
  showProgress('Limpiando skins…', '');
  const r = await api.paint.deleteDownloaded(carId);
  hideProgress();
  toast(`✓ ${r.deleted} archivos · ${fmtB(r.bytes)} liberados`, 'success');
  renderPaint();
}

async function cleanAllDownloaded() {
  const dlF = paintData.reduce((s,c) => s+c.downloadedFiles, 0);
  const dlB = paintData.reduce((s,c) => s+c.downloadedBytes, 0);
  if (!dlF) { toast('No hay skins descargadas', 'info'); return; }
  if (!confirm(`¿Borrar ${dlF} skins descargadas (${fmtB(dlB)})?\n\nTus liveries propios no se tocarán.`)) return;
  showProgress('Limpiando…', `${dlF} archivos`);
  const r = await api.paint.deleteAllDownloaded();
  hideProgress();
  toast(`✓ ${r.deleted} archivos · ${fmtB(r.bytes)} liberados`, 'success');
  renderPaint();
}

// detail panel
function buildDetailPanel() {
  if (eid('detail-panel')) return;
  const p = document.createElement('div');
  p.id = 'detail-panel';
  p.innerHTML = `
    <div id="detail-header">
      <button class="btn btn-ghost btn-xs" onclick="closeDetail()">✕</button>
      <h3 id="detail-title">—</h3>
    </div>
    <div id="detail-body"></div>
    <div id="detail-footer">
      <button class="btn btn-ghost btn-sm" onclick="toggleSelAll()">Sel. todo</button>
      <button class="btn btn-danger btn-sm" id="detail-del-sel" onclick="deleteSelFiles()" disabled>Borrar selección</button>
      <button class="btn btn-danger btn-sm" onclick="cleanCar(detailCarId)">Limpiar descargadas</button>
    </div>`;
  document.body.appendChild(p);
}

let detailCarId = null;
async function openDetail(carId) {
  detailCarId = carId;
  const car   = paintData.find(c => c.id === carId);
  const files = await api.paint.files(carId);
  eid('detail-title').textContent = car?.label || carId;
  eid('detail-body').innerHTML = files.map(f => `
    <div class="file-row">
      <input type="checkbox" data-name="${f.name}" onchange="updateDetailSel()">
      <div class="file-info">
        <div class="file-name ${f.isOwn ? 'own' : ''}">${f.name}</div>
        <div class="file-meta">${fmtDate(f.mtime)}</div>
      </div>
      ${f.isOwn ? '<span class="own-badge">tuyo</span>' : ''}
      <div class="file-size">${fmtB(f.bytes)}</div>
    </div>`).join('');
  eid('detail-panel').classList.add('open');
  updateDetailSel();
}

function closeDetail() { eid('detail-panel')?.classList.remove('open'); detailCarId = null; }
function updateDetailSel() { const b = eid('detail-del-sel'); if (b) b.disabled = !document.querySelectorAll('#detail-body input:checked').length; }
function toggleSelAll() { const bs = document.querySelectorAll('#detail-body input[type=checkbox]'); const a = [...bs].every(b=>b.checked); bs.forEach(b=>b.checked=!a); updateDetailSel(); }
async function deleteSelFiles() {
  const names = [...document.querySelectorAll('#detail-body input:checked')].map(b => b.dataset.name);
  if (!names.length || !confirm(`¿Borrar ${names.length} archivo(s)?`)) return;
  showProgress('Borrando…', '');
  const r = await api.paint.delete(detailCarId, names);
  hideProgress();
  toast(`${r.deleted} eliminados · ${fmtB(r.bytes)}`, 'success');
  openDetail(detailCarId);
  paintData = await api.paint.list();
}

// ═══════════════════════════════════════════════════════════════════════════════
// TELEMETRY
// ═══════════════════════════════════════════════════════════════════════════════
async function renderTelemetry() {
  const el = eid('view-telemetry');
  el.innerHTML = loading('Cargando telemetría…');
  telemetryData = await api.telemetry.list();
  renderTelView();
}

function renderTelView() {
  const el    = eid('view-telemetry');
  const total = telemetryData.reduce((s,f) => s+f.bytes, 0);
  el.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Telemetría</div><div class="page-subtitle">${telemetryData.length} archivos .ibt · ${fmtB(total)}</div></div>
      <div class="header-actions">
        <button class="btn btn-ghost" onclick="api.telemetry.openFolder()">Abrir carpeta</button>
        <button class="btn btn-ghost" onclick="renderTelemetry()">↻</button>
      </div>
    </div>
    <div class="sel-toolbar hidden" id="tel-sel-bar">
      <span class="sel-info" id="tel-sel-info"></span>
      <button class="btn btn-danger btn-sm" onclick="deleteTelSel()">Borrar selección</button>
    </div>
    <div class="table-wrap">
      <div class="toolbar">
        <input class="search-input" id="tel-search" placeholder="Buscar coche o fecha…" oninput="filterTel()" style="width:210px">
        <select class="sort-select" id="tel-sort" onchange="filterTel()">
          <option value="recent">Más recientes</option>
          <option value="oldest">Más antiguos</option>
          <option value="size">Mayor tamaño</option>
          <option value="car">Por coche</option>
        </select>
        <label style="font-size:11px;color:var(--t2);display:flex;align-items:center;gap:5px;cursor:pointer;margin-left:auto">
          <input type="checkbox" id="tel-sel-all" onchange="selAllTel(this.checked)" style="accent-color:var(--yellow)"> Seleccionar todo
        </label>
      </div>
      <div id="tel-list" style="flex:1;overflow-y:auto">${buildFileList(telemetryData, 'tel')}</div>
    </div>`;
}

function buildFileList(files, prefix) {
  if (!files.length) return emptyState('📂', 'No hay archivos');
  return files.map(f => `
    <div class="file-list-row">
      <input type="checkbox" data-name="${f.name}" onchange="onCheck('${prefix}')" style="accent-color:var(--yellow)">
      <div class="flr-main">
        <div class="flr-name">${f.car || f.session || f.name}</div>
        <div class="flr-sub">${f.date ? `${f.date}  ${f.time||''}` : fmtDate(f.mtime)}</div>
      </div>
      <div class="flr-size">${fmtB(f.bytes)}</div>
    </div>`).join('');
}

function filterTel() {
  const q = eid('tel-search').value.toLowerCase();
  const s = eid('tel-sort').value;
  let r = telemetryData.filter(f => (f.car||'').toLowerCase().includes(q) || (f.date||'').includes(q) || f.name.toLowerCase().includes(q));
  r.sort(s==='recent'?(a,b)=>b.mtime-a.mtime : s==='oldest'?(a,b)=>a.mtime-b.mtime : s==='size'?(a,b)=>b.bytes-a.bytes : (a,b)=>(a.car||'').localeCompare(b.car||''));
  eid('tel-list').innerHTML = buildFileList(r, 'tel');
}

function selAllTel(v) { document.querySelectorAll('#tel-list input[type=checkbox]').forEach(b=>b.checked=v); onCheck('tel'); }

function onCheck(prefix) {
  const bar  = eid(`${prefix}-sel-bar`);
  const info = eid(`${prefix}-sel-info`);
  const data = prefix === 'tel' ? telemetryData : replayData;
  const sel  = getChecked(prefix, data);
  if (!bar) return;
  if (sel.length) {
    bar.classList.remove('hidden');
    if (info) info.innerHTML = `<strong>${sel.length}</strong> seleccionados · <strong>${fmtB(sel.reduce((s,f)=>s+f.bytes,0))}</strong>`;
  } else {
    bar.classList.add('hidden');
  }
}

function getChecked(prefix, data) {
  const listId = prefix === 'tel' ? 'tel-list' : 'rep-list';
  return [...document.querySelectorAll(`#${listId} input[type=checkbox]:checked`)]
    .map(b => data.find(f => f.name === b.dataset.name)).filter(Boolean);
}

async function deleteTelSel() {
  const sel = getChecked('tel', telemetryData);
  if (!sel.length || !confirm(`¿Borrar ${sel.length} archivo(s) de telemetría?`)) return;
  showProgress('Borrando…', `${sel.length} archivos`);
  const r = await api.telemetry.delete(sel.map(f=>f.name));
  hideProgress();
  toast(`✓ ${r.deleted} archivos · ${fmtB(r.bytes)} liberados`, 'success');
  renderTelemetry();
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPLAYS
// ═══════════════════════════════════════════════════════════════════════════════
async function renderReplays() {
  const el = eid('view-replays');
  el.innerHTML = loading('Cargando replays…');
  replayData = await api.replays.list();
  const total = replayData.reduce((s,f) => s+f.bytes, 0);
  el.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Replays</div><div class="page-subtitle">${replayData.length} archivos · ${fmtB(total)}</div></div>
      <div class="header-actions">
        <button class="btn btn-ghost" onclick="api.replays.openFolder()">Abrir carpeta</button>
        <button class="btn btn-ghost" onclick="renderReplays()">↻</button>
      </div>
    </div>
    <div class="sel-toolbar hidden" id="rep-sel-bar">
      <span class="sel-info" id="rep-sel-info"></span>
      <button class="btn btn-danger btn-sm" onclick="deleteRepSel()">Borrar selección</button>
    </div>
    <div class="table-wrap">
      <div class="toolbar">
        <label style="font-size:11px;color:var(--t2);display:flex;align-items:center;gap:5px;cursor:pointer;margin-left:auto">
          <input type="checkbox" id="rep-sel-all" onchange="selAllRep(this.checked)" style="accent-color:var(--yellow)"> Seleccionar todo
        </label>
      </div>
      <div id="rep-list" style="flex:1;overflow-y:auto">
        ${replayData.length ? buildFileList(replayData, 'rep') : emptyState('🎬', 'No hay replays guardados')}
      </div>
    </div>`;
}

function selAllRep(v) { document.querySelectorAll('#rep-list input[type=checkbox]').forEach(b=>b.checked=v); onCheck('rep'); }
async function deleteRepSel() {
  const sel = getChecked('rep', replayData);
  if (!sel.length || !confirm(`¿Borrar ${sel.length} replay(s)?`)) return;
  showProgress('Borrando…', '');
  const r = await api.replays.delete(sel.map(f=>f.name));
  hideProgress();
  toast(`✓ ${r.deleted} archivos · ${fmtB(r.bytes)} liberados`, 'success');
  renderReplays();
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETUPS
// ═══════════════════════════════════════════════════════════════════════════════
async function renderSetups() {
  const el = eid('view-setups');
  el.innerHTML = loading('Cargando setups…');
  setupCars = await api.setups.cars();
  const total = setupCars.reduce((s,c) => s+c.count, 0);
  el.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Setups</div><div class="page-subtitle">${setupCars.length} coches · ${total.toLocaleString()} archivos</div></div>
    </div>
    <div class="setup-layout">
      <div class="car-list" id="setup-car-list">
        ${setupCars.map(c => `
          <div class="car-item" data-id="${c.id}" onclick="selectSetupCar('${c.id}')">
            <div class="car-item-name">${c.label}</div>
            <div class="car-item-meta">
              ${c.count > 99 ? `<span style="color:var(--yellow);font-weight:700">${c.count}</span>` : c.count} setups
              ${c.favs ? ` · <span style="color:var(--yellow)">★ ${c.favs}</span>` : ''}
            </div>
          </div>`).join('')}
      </div>
      <div class="setup-files" id="setup-files-panel">
        <div class="empty"><div class="empty-icon">🔧</div><div class="empty-text">Selecciona un coche</div></div>
      </div>
    </div>`;
  if (selectedSetupCar) selectSetupCar(selectedSetupCar);
}

async function selectSetupCar(carId) {
  selectedSetupCar = carId;
  document.querySelectorAll('.car-item').forEach(el => el.classList.toggle('active', el.dataset.id === carId));
  eid('setup-files-panel').innerHTML = loading('Cargando…');
  setupFiles = await api.setups.files(carId);
  const car = setupCars.find(c => c.id === carId);
  renderSetupFiles(car, setupFiles);
}

function renderSetupFiles(car, files) {
  const panel  = eid('setup-files-panel');
  const q      = eid('setup-search')?.value?.toLowerCase() || '';
  const favOnly = eid('setup-fav-only')?.checked;
  let filtered = files.filter(f => f.name.toLowerCase().includes(q) || (f.track||'').includes(q));
  if (favOnly) filtered = filtered.filter(f => f.fav);

  panel.innerHTML = `
    <div class="setup-files-header">
      <input class="search-input" id="setup-search" placeholder="Buscar setup o circuito…"
        oninput="renderSetupFiles(setupCars.find(c=>c.id===selectedSetupCar),setupFiles)" style="flex:1">
      <label style="font-size:11px;color:var(--t2);display:flex;align-items:center;gap:4px;cursor:pointer;white-space:nowrap">
        <input type="checkbox" id="setup-fav-only"
          onchange="renderSetupFiles(setupCars.find(c=>c.id===selectedSetupCar),setupFiles)"
          style="accent-color:var(--yellow)"> Solo ★
      </label>
      <button class="btn btn-ghost btn-xs" onclick="api.setups.openFolder('${car?.id||selectedSetupCar}')">📂</button>
    </div>
    <div class="setup-files-body">
      ${filtered.length ? filtered.map(f => `
        <div class="setup-row">
          <input type="checkbox" data-name="${f.name}" onchange="onSetupCheck()">
          <div class="setup-info">
            <div class="setup-name">${f.name}</div>
            <div class="setup-sub">
              ${f.track ? `<span>🏎 ${f.track}</span>` : ''}
              <span>${fmtDate(f.mtime)}</span>
              ${f.note ? `<span class="setup-note-inline">"${f.note}"</span>` : ''}
            </div>
          </div>
          <button class="fav-btn ${f.fav ? 'active' : ''}"
            onclick="toggleFav('${car?.id||selectedSetupCar}','${f.name.replace(/'/g,"\\'")}')"
            title="${f.fav ? 'Quitar favorito' : 'Favorito'}">★</button>
          <button class="btn btn-xs btn-ghost"
            onclick="openNoteEditor('${car?.id||selectedSetupCar}','${f.name.replace(/'/g,"\\'")}','${(f.note||'').replace(/'/g,"\\'")}')">
            📝
          </button>
        </div>`).join('')
        : emptyState('🔧', q ? 'Sin resultados' : 'No hay setups')}
    </div>
    <div id="setup-sel-bar" class="sel-toolbar hidden" style="margin:10px 14px;border-radius:var(--r)">
      <span class="sel-info" id="setup-sel-info"></span>
      <button class="btn btn-ghost btn-sm" id="setup-compare-btn" style="display:none" onclick="openSetupCompare()">⚖ Comparar</button>
      <button class="btn btn-danger btn-sm" onclick="deleteSelSetups()">Borrar selección</button>
    </div>`;
}

function onSetupCheck() {
  const names = [...document.querySelectorAll('.setup-row input:checked')].map(b => b.dataset.name);
  const n = names.length;
  const bar = eid('setup-sel-bar'), info = eid('setup-sel-info');
  if (!bar) return;
  if (n) {
    bar.classList.remove('hidden');
    if (info) info.innerHTML = `<strong>${n}</strong> seleccionados`;
    const cmpBtn = eid('setup-compare-btn');
    if (cmpBtn) cmpBtn.style.display = n === 2 ? 'inline-flex' : 'none';
  } else {
    bar.classList.add('hidden');
  }
}

async function toggleFav(carId, file) {
  const isFav = await api.setups.fav(carId, file);
  const f = setupFiles.find(s => s.name === file);
  if (f) f.fav = isFav;
  renderSetupFiles(setupCars.find(c => c.id === carId), setupFiles);
  toast(isFav ? '★ Marcado como favorito' : 'Quitado de favoritos', 'info');
}

async function deleteSelSetups() {
  const names = [...document.querySelectorAll('.setup-row input:checked')].map(b => b.dataset.name);
  if (!names.length || !confirm(`¿Borrar ${names.length} setup(s)?`)) return;
  showProgress('Borrando…', '');
  const r = await api.setups.delete(selectedSetupCar, names);
  hideProgress();
  toast(`✓ ${r.deleted} eliminados`, 'success');
  setupFiles = await api.setups.files(selectedSetupCar);
  renderSetupFiles(setupCars.find(c => c.id === selectedSetupCar), setupFiles);
}

// note editor
function buildNoteOverlay() {
  if (eid('note-overlay')) return;
  const d = document.createElement('div');
  d.id = 'note-overlay'; d.className = 'note-overlay'; d.hidden = true;
  d.innerHTML = `<div class="note-box">
    <h4>Nota del setup</h4>
    <h5 id="note-title"></h5>
    <textarea id="note-ta" placeholder="Baseline, pista mojada, chicane rápida…"></textarea>
    <div class="note-box-footer">
      <button class="btn btn-ghost btn-sm" onclick="closeNote()">Cancelar</button>
      <button class="btn btn-primary btn-sm" onclick="saveNote()">Guardar</button>
    </div>
  </div>`;
  document.body.appendChild(d);
}

let noteCtx = {};
function openNoteEditor(carId, file, note) {
  noteCtx = { carId, file };
  eid('note-title').textContent = file;
  eid('note-ta').value = note || '';
  eid('note-overlay').hidden = false;
}
function closeNote() { eid('note-overlay').hidden = true; }
async function saveNote() {
  await api.setups.note(noteCtx.carId, noteCtx.file, eid('note-ta').value);
  const f = setupFiles.find(s => s.name === noteCtx.file);
  if (f) f.note = eid('note-ta').value;
  closeNote();
  renderSetupFiles(setupCars.find(c => c.id === noteCtx.carId), setupFiles);
  toast('Nota guardada', 'success');
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGS
// ═══════════════════════════════════════════════════════════════════════════════
async function renderConfigs() {
  const el = eid('view-configs');
  el.innerHTML = loading('Cargando configs…');
  const [files, backups] = await Promise.all([api.config.files(), api.config.backups()]);

  el.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Config Backup</div><div class="page-subtitle">Protege tus ajustes antes de cada actualización</div></div>
      <div class="header-actions">
        <button class="btn btn-primary" onclick="createBackup()">Hacer backup</button>
      </div>
    </div>
    <div class="config-layout">
      <div class="card" style="padding:0;overflow:hidden;display:flex;flex-direction:column">
        <div style="padding:14px 18px;border-bottom:1px solid var(--b1)"><div class="card-title" style="margin:0">Archivos actuales</div></div>
        <div style="flex:1;overflow-y:auto">
          ${files.map(f => `
            <div class="config-file-item">
              <div style="width:8px;height:8px;border-radius:50%;background:${f.exists?'var(--green)':'var(--t3)'};flex-shrink:0"></div>
              <div style="flex:1">
                <div style="font-size:12px;font-weight:600;color:${f.exists?'var(--text)':'var(--t3)'}">${f.name}</div>
                <div style="font-size:10px;color:var(--t2);margin-top:1px">${f.exists ? `${fmtB(f.bytes)} · ${fmtDate(f.mtime)}` : 'No encontrado'}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>
      <div class="card" style="padding:0;overflow:hidden;display:flex;flex-direction:column">
        <div style="padding:14px 18px;border-bottom:1px solid var(--b1);display:flex;align-items:center;justify-content:space-between">
          <div class="card-title" style="margin:0">Backups guardados</div>
          <span style="font-size:11px;color:var(--t2)">${backups.length} guardados</span>
        </div>
        <div style="flex:1;overflow-y:auto">
          ${backups.length ? backups.map(b => `
            <div class="backup-item">
              <div class="backup-icon">💾</div>
              <div class="backup-info">
                <div class="backup-name">${b.name}</div>
                <div class="backup-meta">${fmtDate(b.date)} · ${fmtB(b.size)} · ${b.files?.length||0} archivos</div>
              </div>
              <div style="display:flex;gap:6px;flex-shrink:0">
                <button class="btn btn-xs btn-success" onclick="restoreBackup('${b.id}')">↩ Restaurar</button>
                <button class="btn btn-xs btn-ghost" onclick="deleteBackup('${b.id}')">✕</button>
              </div>
            </div>`).join('')
            : emptyState('💾', 'Ningún backup todavía')}
        </div>
      </div>
    </div>`;
}

async function createBackup() {
  const name = prompt('Nombre del backup (opcional):') ?? null;
  if (name === null) return;
  showProgress('Haciendo backup…', '');
  const r = await api.config.backup(name || '');
  hideProgress();
  toast(`✓ ${r.files.length} archivos guardados · ${fmtB(r.size)}`, 'success');
  renderConfigs();
}

async function restoreBackup(id) {
  if (!confirm('¿Restaurar este backup? Los archivos actuales serán reemplazados.')) return;
  showProgress('Restaurando…', '');
  const r = await api.config.restore(id);
  hideProgress();
  if (r.ok) toast(`✓ Restaurados: ${r.files.join(', ')}`, 'success');
  else toast(`Error: ${r.error}`, 'error');
}

async function deleteBackup(id) {
  if (!confirm('¿Eliminar este backup?')) return;
  await api.config.deleteBackup(id);
  toast('Backup eliminado', 'info');
  renderConfigs();
}

// ═══════════════════════════════════════════════════════════════════════════════
// CRASHES
// ═══════════════════════════════════════════════════════════════════════════════
async function renderCrashes() {
  const el = eid('view-crashes');
  el.innerHTML = loading('Buscando crash logs…');
  const crashes = await api.crashes.list();
  const totalB  = crashes.reduce((s,c) => s+c.bytes, 0);

  el.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Crash Logs</div><div class="page-subtitle">${crashes.length} crashes · ${fmtB(totalB)}</div></div>
      <div class="header-actions">
        ${crashes.length ? `<button class="btn btn-danger" onclick="deleteAllCrashes()">Borrar todos</button>` : ''}
      </div>
    </div>
    <div class="crash-layout">
      <div class="crash-list-panel">
        ${crashes.length ? crashes.map(c => `
          <div class="crash-item" onclick="showCrashLog('${c.base}','${c.log||''}')">
            <div class="crash-item-date">💥 ${fmtDate(c.mtime)}</div>
            <div class="crash-item-meta">${c.dmp}${c.log ? ' + log' : ''} · ${fmtB(c.bytes)}</div>
          </div>`)
          .join('') : emptyState('💥', 'Sin crashes')}
      </div>
      <div class="crash-log-panel" id="crash-log-content" style="color:var(--t3)">
        ${crashes.length ? 'Selecciona un crash para ver el log.' : 'No hay crash dumps en la carpeta de iRacing.'}
      </div>
    </div>`;
}

async function showCrashLog(base, logName) {
  activeCrash = base;
  document.querySelectorAll('.crash-item').forEach(el => el.classList.remove('active'));
  event?.currentTarget?.classList?.add('active');
  const panel = eid('crash-log-content');
  if (!logName) { panel.innerHTML = '<span style="color:var(--t3)">No hay archivo .log para este crash.</span>'; return; }
  panel.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  const content = await api.crashes.readLog(logName);
  panel.textContent = content || '(log vacío)';
}

async function deleteAllCrashes() {
  const crashes = await api.crashes.list();
  const files   = crashes.flatMap(c => [c.dmp, ...(c.log ? [c.log] : [])]);
  if (!files.length || !confirm(`¿Borrar ${crashes.length} crashes?`)) return;
  showProgress('Borrando…', '');
  const r = await api.crashes.delete(files);
  hideProgress();
  toast(`✓ ${r.deleted} archivos · ${fmtB(r.bytes)} liberados`, 'success');
  activeCrash = null;
  renderCrashes();
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAUNCH
// ═══════════════════════════════════════════════════════════════════════════════
async function renderLaunch() {
  const el = eid('view-launch');
  el.innerHTML = loading('Buscando apps…');
  const apps      = await api.launch.apps();
  const available = apps.filter(a => a.available);
  const missing   = apps.filter(a => !a.available);

  el.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Lanzar</div><div class="page-subtitle">${available.length} de ${apps.length} apps encontradas</div></div>
      <div class="header-actions">
        <button class="btn btn-ghost" onclick="api.launch.iracingSite()">🌐 Members</button>
      </div>
    </div>
    <div class="card" style="padding:18px 20px">
      <div class="card-title">Apps disponibles</div>
      <div class="launch-grid">
        ${available.map(a => `
          <div class="launch-card" onclick="launchApp('${a.exePath}','${a.id}')">
            <div class="launch-icon">${a.icon}</div>
            <div class="launch-label">${a.label}</div>
            <div class="launch-status ok">Disponible</div>
          </div>`).join('')}
        <div class="launch-card" onclick="api.launch.iracingSite()">
          <div class="launch-icon">🌐</div>
          <div class="launch-label">Members Site</div>
          <div class="launch-status ok">Web</div>
        </div>
        <div class="launch-card" onclick="api.launch.openFolder('C:\\\\Users\\\\zizek\\\\Documents\\\\iRacing')">
          <div class="launch-icon">📁</div>
          <div class="launch-label">Carpeta iRacing</div>
          <div class="launch-status ok">Documents</div>
        </div>
      </div>
    </div>
    ${missing.length ? `
    <div class="card" style="padding:18px 20px">
      <div class="card-title">No encontradas</div>
      <div class="launch-grid">
        ${missing.map(a => `
          <div class="launch-card disabled">
            <div class="launch-icon">${a.icon}</div>
            <div class="launch-label">${a.label}</div>
            <div class="launch-status">No instalada</div>
          </div>`).join('')}
      </div>
    </div>` : ''}`;
}

async function launchApp(exePath, id) {
  const cwdMap = {
    'corner-coach': 'C:\\Users\\zizek\\Documents\\iracing-corner-coach',
    'manager':      'C:\\Users\\zizek\\Documents\\iracing-manager',
    'livery':       'C:\\Users\\zizek\\Documents\\iracing-livery-creator',
    'photo-tool':   'C:\\Users\\zizek\\Documents\\iracing-photo-tool',
  };
  const r = await api.launch.exec(exePath, cwdMap[id] || null);
  if (r.ok) toast(`Lanzando ${id}…`, 'success');
  else toast('No se pudo lanzar la app', 'error');
}

// ═══════════════════════════════════════════════════════════════════════════════
// OVERLAYS
// ═══════════════════════════════════════════════════════════════════════════════
function buildProgressOverlay() {
  if (eid('progress-overlay')) return;
  const d = document.createElement('div');
  d.id = 'progress-overlay'; d.hidden = true;
  d.innerHTML = `<div class="progress-box">
    <div class="progress-spin"></div>
    <h3 id="prog-title">Trabajando…</h3>
    <p id="prog-sub"></p>
  </div>`;
  document.body.appendChild(d);
}

function showProgress(t, s) {
  eid('prog-title').textContent = t;
  eid('prog-sub').textContent   = s;
  eid('progress-overlay').hidden = false;
}
function hideProgress() { eid('progress-overlay').hidden = true; }

function toast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  eid('toast-container').appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════════════════════
const eid     = id => document.getElementById(id);
const fmtB    = b  => b >= 1e9 ? (b/1e9).toFixed(1)+' GB' : b >= 1e6 ? (b/1e6).toFixed(1)+' MB' : b >= 1e3 ? (b/1e3).toFixed(0)+' KB' : b+' B';
const fmtDate = ms => new Date(ms).toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric' });
const loading  = msg => `<div class="loading"><div class="spinner"></div>${msg}</div>`;
const emptyState = (icon, msg) => `<div class="empty"><div class="empty-icon">${icon}</div><div class="empty-text">${msg}</div></div>`;

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-CLEANUP
// ═══════════════════════════════════════════════════════════════════════════════
async function renderAutoClean() {
  const el = eid('view-auto');
  el.innerHTML = loading('Cargando ajustes…');
  const settings = await api.settings.get();
  const ac = settings.autoClean || { enabled: false, telemetryDays: 30, paintDays: 14, replayDays: 0 };

  el.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Auto-Limpieza</div><div class="page-subtitle">Elimina archivos viejos automáticamente al abrir la app</div></div>
      <div class="header-actions">
        <button class="btn btn-ghost" onclick="previewAutoClean()">Ver previsualización</button>
        <button class="btn btn-primary" onclick="saveAutoClean()">Guardar</button>
        <button class="btn btn-danger" onclick="runAutoCleanNow()">Limpiar ahora</button>
      </div>
    </div>

    <div class="card">
      <div class="settings-row">
        <div class="settings-row-info">
          <div class="settings-row-title">Activar auto-limpieza al iniciar</div>
          <div class="settings-row-sub">Al abrir la app, borra automáticamente los archivos que superen el límite configurado — una vez al día como máximo</div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="ac-enabled" ${ac.enabled ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <div class="ac-grid">
      <div class="card">
        <div class="card-title">Telemetría (.ibt)</div>
        <div class="ac-row">
          <span class="ac-label">Borrar archivos más antiguos de</span>
          <div class="ac-days-input">
            <input type="number" id="ac-tel-days" class="days-input" min="0" max="999" value="${ac.telemetryDays || 0}">
            <span class="ac-days-unit">días</span>
          </div>
        </div>
        <div class="ac-hint">${(ac.telemetryDays||0) > 0 ? `Archivos de más de ${ac.telemetryDays} días serán eliminados` : 'Pon un valor > 0 para activar'}</div>
      </div>

      <div class="card">
        <div class="card-title">Skins descargadas</div>
        <div class="ac-row">
          <span class="ac-label">Borrar skins más antiguas de</span>
          <div class="ac-days-input">
            <input type="number" id="ac-paint-days" class="days-input" min="0" max="999" value="${ac.paintDays || 0}">
            <span class="ac-days-unit">días</span>
          </div>
        </div>
        <div class="ac-hint">${(ac.paintDays||0) > 0 ? `Skins de más de ${ac.paintDays} días serán eliminadas` : 'Pon un valor > 0 para activar'}</div>
      </div>

      <div class="card">
        <div class="card-title">Replays</div>
        <div class="ac-row">
          <span class="ac-label">Borrar replays más antiguos de</span>
          <div class="ac-days-input">
            <input type="number" id="ac-rep-days" class="days-input" min="0" max="999" value="${ac.replayDays || 0}">
            <span class="ac-days-unit">días</span>
          </div>
        </div>
        <div class="ac-hint">${(ac.replayDays||0) > 0 ? `Replays de más de ${ac.replayDays} días serán eliminados` : 'Pon un valor > 0 para activar'}</div>
      </div>
    </div>

    <div id="ac-preview-section" class="card" hidden>
      <div class="card-title">Previsualización — qué se borraría ahora</div>
      <div id="ac-preview-content"></div>
    </div>`;
}

async function saveAutoClean() {
  const settings = await api.settings.get();
  settings.autoClean = {
    enabled:      eid('ac-enabled').checked,
    telemetryDays: Math.max(0, parseInt(eid('ac-tel-days').value)   || 0),
    paintDays:     Math.max(0, parseInt(eid('ac-paint-days').value) || 0),
    replayDays:    Math.max(0, parseInt(eid('ac-rep-days').value)   || 0)
  };
  await api.settings.save(settings);
  toast('Ajustes guardados', 'success');
  return settings.autoClean;
}

async function previewAutoClean() {
  const ac = await saveAutoClean();
  const anyActive = ac.telemetryDays > 0 || ac.paintDays > 0 || ac.replayDays > 0;
  if (!anyActive) { toast('Configura al menos un tipo con días > 0', 'info'); return; }
  showProgress('Calculando…', '');
  const preview = await api.autoclean.preview();
  hideProgress();

  const sec = eid('ac-preview-section');
  const cnt = eid('ac-preview-content');
  sec.hidden = false;

  const telB  = preview.telemetry.reduce((s,f) => s+f.bytes, 0);
  const paintB = preview.paint.reduce((s,f) => s+f.bytes, 0);
  const repB  = preview.replays.reduce((s,f) => s+f.bytes, 0);
  const total = preview.telemetry.length + preview.paint.length + preview.replays.length;

  if (!total) {
    cnt.innerHTML = `<div class="empty" style="padding:24px"><div class="empty-icon" style="font-size:24px">✓</div><div class="empty-text">Nada que limpiar con los ajustes actuales</div></div>`;
    return;
  }

  cnt.innerHTML = `
    <div class="ac-preview-stats">
      ${preview.telemetry.length ? `<div class="ac-preview-item">
        <span class="ac-preview-label">Telemetría</span>
        <span class="ac-preview-count">${preview.telemetry.length} archivos</span>
        <span class="ac-preview-size">${fmtB(telB)}</span>
      </div>` : ''}
      ${preview.paint.length ? `<div class="ac-preview-item">
        <span class="ac-preview-label">Skins descargadas</span>
        <span class="ac-preview-count">${preview.paint.length} archivos</span>
        <span class="ac-preview-size">${fmtB(paintB)}</span>
      </div>` : ''}
      ${preview.replays.length ? `<div class="ac-preview-item">
        <span class="ac-preview-label">Replays</span>
        <span class="ac-preview-count">${preview.replays.length} archivos</span>
        <span class="ac-preview-size">${fmtB(repB)}</span>
      </div>` : ''}
    </div>
    <div class="ac-preview-total">
      Total: <strong>${total.toLocaleString()} archivos · ${fmtB(telB + paintB + repB)}</strong> a eliminar
    </div>`;
}

async function runAutoCleanNow() {
  showProgress('Calculando…', '');
  const preview = await api.autoclean.preview();
  hideProgress();
  const total = preview.telemetry.length + preview.paint.length + preview.replays.length;
  if (!total) { toast('Nada que limpiar con los ajustes actuales', 'info'); return; }
  const telB   = preview.telemetry.reduce((s,f) => s+f.bytes, 0);
  const paintB = preview.paint.reduce((s,f) => s+f.bytes, 0);
  const repB   = preview.replays.reduce((s,f) => s+f.bytes, 0);
  if (!confirm(`¿Borrar ${total} archivos (${fmtB(telB+paintB+repB)})?\n\n• Telemetría: ${preview.telemetry.length}\n• Skins descargadas: ${preview.paint.length}\n• Replays: ${preview.replays.length}`)) return;
  showProgress('Limpiando…', `${total} archivos`);
  const results = await api.autoclean.run();
  hideProgress();
  let deleted = 0, bytes = 0;
  for (const r of Object.values(results)) { deleted += r.deleted || 0; bytes += r.bytes || 0; }
  toast(`✓ ${deleted} archivos · ${fmtB(bytes)} liberados`, 'success');
  renderAutoClean();
}

// ═══════════════════════════════════════════════════════════════════════════════
// INSTALL SCANNER
// ═══════════════════════════════════════════════════════════════════════════════
let installPath = null;
let installActiveTab = 'cars';

async function renderInstall() {
  const el = eid('view-install');
  el.innerHTML = loading('Buscando instalación de iRacing…');
  const found = await api.install.find();
  installPath = found.path;
  if (!found.found) {
    el.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">Instalación</div><div class="page-subtitle">Contenido instalado en iRacing</div></div>
      </div>
      <div class="empty" style="flex:1">
        <div class="empty-icon">💽</div>
        <div class="empty-text">No se encontró la instalación de iRacing</div>
        <button class="btn btn-primary" style="margin-top:16px" onclick="browseInstall()">Seleccionar carpeta…</button>
      </div>`;
    return;
  }
  renderInstallUI();
}

async function renderInstallUI() {
  const el = eid('view-install');
  const status = await api.iracing.status();
  const loggedIn = status.loggedIn;

  el.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Instalación</div><div class="page-subtitle">Contenido instalado en iRacing</div></div>
      <div class="header-actions">
        <button class="btn btn-ghost" onclick="browseInstall()">Cambiar ruta</button>
        <button class="btn btn-ghost" onclick="api.install.open(installPath)">📂 Abrir</button>
        <button class="btn btn-ghost" onclick="loadInstallTab(installActiveTab)">↻</button>
      </div>
    </div>

    <div class="ir-path-card">
      <div class="ir-path-text">${installPath}</div>
      ${loggedIn
        ? `<div class="ir-account-ok">● ${status.email}</div>
           <button class="btn btn-xs btn-ghost" onclick="refreshImages()" title="Actualizar mapa de imágenes">↻ imgs</button>
           <button class="btn btn-xs btn-ghost" onclick="logoutIracing()">Salir</button>`
        : `<button class="btn btn-xs btn-ghost" onclick="openLogin()">Conectar iRacing →</button>`}
    </div>

    <div class="tab-bar">
      <button class="tab-btn" id="tab-cars"   onclick="loadInstallTab('cars')">Coches</button>
      <button class="tab-btn" id="tab-tracks" onclick="loadInstallTab('tracks')">Pistas</button>
    </div>

    <div class="table-wrap" id="install-table-wrap" style="flex:1">${loading('Escaneando…')}</div>`;

  loadInstallTab(installActiveTab);
}

async function loadInstallTab(type) {
  installActiveTab = type;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.id === `tab-${type}`));
  const wrap = eid('install-table-wrap');
  if (!wrap) return;
  wrap.innerHTML = loading(`Escaneando ${type === 'cars' ? 'coches' : 'pistas'}…`);

  const [items, cached] = await Promise.all([
    api.install.scan({ installPath, type }),
    api.iracing.cachedAssets(type)
  ]);
  const imageMap = cached.map || {};
  const totalB = items.reduce((s,i) => s+i.bytes, 0);

  if (!items.length) {
    wrap.innerHTML = emptyState('📁', `No se encontró la carpeta "${type}" en la instalación`);
    return;
  }

  const CDN = 'https://images-static.iracing.com/img';
  const imgUrl = (id) => imageMap[id]
    || (type === 'cars' ? `${CDN}/cars/${id}/car_image.jpg` : `${CDN}/tracks/${id}/track_map.png`);

  const initials = (label) => label.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '??';
  const PALETTE = ['#4B8EF5','#22C55E','#A855F7','#F59E0B','#EF4444','#06B6D4','#EC4899','#84CC16'];
  const colorFor = (id) => PALETTE[id.split('').reduce((s,c) => s + c.charCodeAt(0), 0) % PALETTE.length];

  wrap.innerHTML = `
    <div class="toolbar" style="justify-content:space-between">
      <span style="font-size:11px;color:var(--t2)">${items.length} ${type === 'cars' ? 'coches' : 'pistas'} instalados</span>
      <span style="font-size:12px;font-weight:700;font-variant-numeric:tabular-nums">${fmtB(totalB)} total</span>
    </div>
    <div style="flex:1;overflow-y:auto">
      ${items.map((item, i) => {
        const pct = totalB > 0 ? item.bytes / totalB * 100 : 0;
        const init = initials(item.label);
        const color = colorFor(item.id);
        return `
          <div class="install-row" data-path="${installPath}\\${type}\\${item.id}" onclick="api.install.open(this.dataset.path)">
            <div class="install-thumb">
              <img src="${imgUrl(item.id)}" alt="" loading="lazy"
                onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
              <div class="install-initial" style="display:none;background:${color}20;color:${color};border:1px solid ${color}30">${init}</div>
            </div>
            <div class="install-rank">${i+1}</div>
            <div class="install-info">
              <div class="install-name">${item.label}</div>
              <div class="install-meta">${item.files.toLocaleString()} archivos</div>
            </div>
            <div class="install-bar-wrap">
              <div class="install-bar" style="width:${pct.toFixed(1)}%"></div>
            </div>
            <div class="install-size">${fmtB(item.bytes)}</div>
          </div>`;
      }).join('')}
    </div>`;
}

async function browseInstall() {
  const p = await api.install.browse();
  if (!p) return;
  const r = await api.install.set(p);
  if (r.ok) { installPath = p; renderInstallUI(); }
  else toast('Ruta no válida', 'error');
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETUP COMPARE
// ═══════════════════════════════════════════════════════════════════════════════
function buildCompareOverlay() {
  if (eid('compare-overlay')) return;
  const d = document.createElement('div');
  d.id = 'compare-overlay';
  d.className = 'compare-overlay';
  d.hidden = true;
  d.innerHTML = `
    <div class="compare-box">
      <div class="compare-header">
        <h3>⚖ Comparar Setups</h3>
        <button class="btn btn-ghost btn-xs" onclick="closeCompare()">✕</button>
      </div>
      <div class="compare-body" id="compare-body"></div>
    </div>`;
  document.body.appendChild(d);
}

async function openSetupCompare() {
  const names = [...document.querySelectorAll('.setup-row input:checked')].map(b => b.dataset.name);
  if (names.length !== 2) return;
  const overlay = eid('compare-overlay');
  if (!overlay) return;
  overlay.hidden = false;
  eid('compare-body').innerHTML = loading('Leyendo archivos…');
  const data = await api.setup.compare({ carId: selectedSetupCar, names });
  renderCompareBody(data);
}

function renderCompareBody(data) {
  const [a, b] = data;
  const sizeDiff = a.size !== b.size;
  const safeNote = (n) => (n || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  eid('compare-body').innerHTML = `
    <div class="compare-cols">
      <div class="compare-col">
        <div class="compare-col-title">${a.fav ? '★ ' : ''}${a.name}</div>
        <div class="compare-col-meta">
          <div class="compare-meta-row"><span>Tamaño</span><span>${fmtB(a.size)}</span></div>
          <div class="compare-meta-row"><span>Modificado</span><span>${fmtDate(a.mtime)}</span></div>
        </div>
        ${a.note ? `<div class="compare-note"><div class="compare-note-label">Nota guardada</div><div class="compare-note-text">${safeNote(a.note)}</div></div>` : '<div class="compare-note compare-note-empty"><div class="compare-note-label">Sin nota</div></div>'}
        ${a.text ? `<div><div class="compare-note-label" style="margin-bottom:5px">Descripción del archivo</div><pre class="compare-pre">${a.text.substring(0,500)}</pre></div>` : ''}
      </div>
      <div class="compare-divider"></div>
      <div class="compare-col">
        <div class="compare-col-title">${b.fav ? '★ ' : ''}${b.name}</div>
        <div class="compare-col-meta">
          <div class="compare-meta-row"><span>Tamaño</span><span class="${sizeDiff ? 'diff-val' : ''}">${fmtB(b.size)}${sizeDiff ? ' ↕' : ''}</span></div>
          <div class="compare-meta-row"><span>Modificado</span><span>${fmtDate(b.mtime)}</span></div>
        </div>
        ${b.note ? `<div class="compare-note"><div class="compare-note-label">Nota guardada</div><div class="compare-note-text">${safeNote(b.note)}</div></div>` : '<div class="compare-note compare-note-empty"><div class="compare-note-label">Sin nota</div></div>'}
        ${b.text ? `<div><div class="compare-note-label" style="margin-bottom:5px">Descripción del archivo</div><pre class="compare-pre">${b.text.substring(0,500)}</pre></div>` : ''}
      </div>
    </div>
    <div class="compare-actions">
      <button class="btn btn-ghost btn-sm" onclick="closeCompare();openNoteEditor('${selectedSetupCar}','${a.name.replace(/'/g,"\\'")}','${safeNote(a.note).replace(/'/g,"\\'")}')">📝 Nota de A</button>
      <button class="btn btn-ghost btn-sm" onclick="closeCompare();openNoteEditor('${selectedSetupCar}','${b.name.replace(/'/g,"\\'")}','${safeNote(b.note).replace(/'/g,"\\'")}')">📝 Nota de B</button>
      <div style="flex:1"></div>
      <div style="font-size:10px;color:var(--t3);align-self:center">Los .sto son binarios — compara visualmente en el simulador</div>
    </div>`;
}

function closeCompare() {
  const o = eid('compare-overlay');
  if (o) o.hidden = true;
}

// ── iRacing login ─────────────────────────────────────────────────────────────

function buildLoginOverlay() {
  if (eid('login-overlay')) return;
  const d = document.createElement('div');
  d.id = 'login-overlay';
  d.className = 'note-overlay';
  d.hidden = true;
  d.innerHTML = `
    <div class="note-box" style="width:340px;gap:16px">
      <div>
        <h4 style="margin:0 0 4px">Cuenta iRacing</h4>
        <div style="font-size:11px;color:var(--t2)">Conéctate para cargar imágenes reales de coches y pistas desde el CDN de iRacing</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <input type="email"    id="login-email"    class="text-input" style="width:100%;box-sizing:border-box" placeholder="Email de iRacing" autocomplete="email">
        <input type="password" id="login-password" class="text-input" style="width:100%;box-sizing:border-box" placeholder="Contraseña"       autocomplete="current-password">
        <div id="login-error" style="font-size:11px;color:var(--red);display:none;padding:7px 10px;background:rgba(239,68,68,.1);border-radius:var(--r2);border:1px solid rgba(239,68,68,.2)"></div>
      </div>
      <div class="note-box-footer">
        <button class="btn btn-ghost btn-sm" onclick="closeLogin()">Cancelar</button>
        <button class="btn btn-primary btn-sm" id="login-submit" onclick="submitLogin()">Conectar</button>
      </div>
    </div>`;
  d.addEventListener('keydown', e => {
    if (e.key === 'Enter')  submitLogin();
    if (e.key === 'Escape') closeLogin();
  });
  document.body.appendChild(d);
}

function openLogin() {
  const o = eid('login-overlay');
  o.hidden = false;
  eid('login-error').style.display = 'none';
  eid('login-email').value = '';
  eid('login-password').value = '';
  setTimeout(() => eid('login-email').focus(), 50);
}

function closeLogin() { eid('login-overlay').hidden = true; }

async function submitLogin() {
  const email    = eid('login-email').value.trim();
  const password = eid('login-password').value;
  const errEl    = eid('login-error');
  const btn      = eid('login-submit');

  if (!email || !password) {
    errEl.textContent = 'Rellena email y contraseña';
    errEl.style.display = 'block';
    return;
  }

  btn.textContent = 'Conectando…';
  btn.disabled = true;
  errEl.style.display = 'none';

  const result = await api.iracing.login({ email, password });

  if (!result.ok) {
    errEl.textContent = result.error || 'Error desconocido';
    errEl.style.display = 'block';
    btn.textContent = 'Conectar';
    btn.disabled = false;
    return;
  }

  closeLogin();
  toast(`Conectado como ${result.email}`, 'success');

  // Descarga el mapa de imágenes en segundo plano
  Promise.all([
    api.iracing.fetchAssets('cars'),
    api.iracing.fetchAssets('tracks')
  ]).then(([r1, r2]) => {
    const count = (r1.count || 0) + (r2.count || 0);
    toast(`${count} imágenes disponibles`, 'success');
    if (eid('view-install').classList.contains('active')) loadInstallTab(installActiveTab);
  });

  // Recarga cabecera del install para mostrar el email conectado
  if (eid('view-install').classList.contains('active')) renderInstallUI();
}

async function logoutIracing() {
  await api.iracing.logout();
  toast('Sesión cerrada', 'info');
  if (eid('view-install').classList.contains('active')) renderInstallUI();
}

async function refreshImages() {
  const btn = event.target;
  const orig = btn.textContent;
  btn.textContent = '…';
  btn.disabled = true;

  const [r1, r2] = await Promise.all([
    api.iracing.fetchAssets('cars'),
    api.iracing.fetchAssets('tracks')
  ]);

  btn.textContent = orig;
  btn.disabled = false;

  if (!r1.ok) { toast(`Error: ${r1.error}`, 'error'); return; }
  const count = (r1.count || 0) + (r2.count || 0);
  toast(`${count} imágenes actualizadas`, 'success');
  loadInstallTab(installActiveTab);
}
