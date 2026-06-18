// ── state ──────────────────────────────────────────────────────────────────────
let paintData = [];
let telemetryData = [];
let currentView = 'overview';
let detailCarId = null;
let detailFiles = [];

// ── init ───────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupNav();
  buildProgressOverlay();
  showView('overview');
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
  currentView = name;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${name}`).classList.add('active');
  if (name === 'overview') renderOverview();
  else if (name === 'paint') renderPaint();
  else if (name === 'telemetry') renderTelemetry();
}

// ── OVERVIEW ───────────────────────────────────────────────────────────────────
async function renderOverview() {
  const el = document.getElementById('view-overview');
  el.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Uso del disco</div>
        <div class="page-subtitle">Resumen de todas las carpetas de iRacing</div>
      </div>
      <button class="btn btn-ghost" onclick="renderOverview()">↻ Actualizar</button>
    </div>
    <div class="loading"><div class="spinner"></div> Escaneando carpetas…</div>
  `;
  const data = await api.disk.overview();
  const total = data.reduce((s, f) => s + f.bytes, 0);
  const maxBytes = Math.max(...data.map(f => f.bytes), 1);

  const colors = { paint: '#4f8ef7', telemetry: '#7c5ff0', replay: '#3ecf70', setups: '#f0a040', logs: '#e05252' };

  el.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Uso del disco</div>
        <div class="page-subtitle">Total iRacing: <strong>${fmtBytes(total)}</strong></div>
      </div>
      <button class="btn btn-ghost" onclick="renderOverview()">↻ Actualizar</button>
    </div>
    <div class="disk-grid">
      ${data.map(f => {
        const pct = f.bytes / maxBytes * 100;
        const sizeClass = f.bytes > 5e9 ? 'disk-big' : f.bytes > 1e9 ? 'disk-med' : 'disk-low';
        return `
          <div class="disk-card" style="cursor:${f.key!=='logs'?'pointer':'default'}" onclick="${f.key==='paint'?'showView(\'paint\')':f.key==='telemetry'?'showView(\'telemetry\')':''}">
            <div class="disk-card-label">${f.label}</div>
            <div class="disk-card-size ${sizeClass}">${fmtBytes(f.bytes)}</div>
            <div class="disk-card-meta">${f.files.toLocaleString()} archivos${!f.exists?' · no encontrada':''}</div>
            <div class="disk-card-bar"><div class="disk-card-fill" style="width:${pct.toFixed(1)}%;background:${colors[f.key]||'var(--accent)'}"></div></div>
          </div>`;
      }).join('')}
    </div>
    <div class="card">
      <div class="card-title">Qué puedes limpiar</div>
      ${data.map(f => {
        if (!f.exists || f.bytes === 0) return '';
        const tip = f.key==='paint' ? 'Skins descargadas de otros pilotos — la mayoría se pueden borrar sin perder nada tuyo' :
                    f.key==='telemetry' ? 'Archivos .ibt de sesiones pasadas — elimina los que ya no necesites' :
                    f.key==='logs' ? 'Logs y crash dumps — seguros de borrar' : '';
        if (!tip) return '';
        return `<div class="stat-row">
          <span class="stat-label">${f.label}</span>
          <span class="stat-value">${fmtBytes(f.bytes)}</span>
          <span class="tag tag-warn">Limpiable</span>
        </div><div style="font-size:12px;color:var(--muted);padding:0 0 10px 0">${tip}</div>`;
      }).join('')}
    </div>
  `;
}

// ── PAINT ──────────────────────────────────────────────────────────────────────
async function renderPaint() {
  const el = document.getElementById('view-paint');
  el.innerHTML = `<div class="loading"><div class="spinner"></div> Escaneando skins…</div>`;

  paintData = await api.paint.list();

  const totalBytes = paintData.reduce((s, c) => s + c.bytes, 0);
  const downloadedBytes = paintData.reduce((s, c) => s + c.downloadedBytes, 0);
  const downloadedFiles = paintData.reduce((s, c) => s + c.downloadedFiles, 0);

  el.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Paint / Skins</div>
        <div class="page-subtitle">${paintData.length} coches · <strong>${fmtBytes(totalBytes)}</strong> total</div>
      </div>
      <button class="btn btn-danger" onclick="cleanAllDownloaded()">
        🗑 Limpiar todo lo descargado (${fmtBytes(downloadedBytes)})
      </button>
    </div>

    <div class="card" style="flex-shrink:0">
      <div style="display:flex;gap:24px;flex-wrap:wrap">
        <div><div style="font-size:12px;color:var(--muted)">Skins descargadas</div><div style="font-size:22px;font-weight:800;color:var(--danger)">${downloadedFiles.toLocaleString()} archivos</div></div>
        <div><div style="font-size:12px;color:var(--muted)">Espacio recuperable</div><div style="font-size:22px;font-weight:800;color:var(--success)">${fmtBytes(downloadedBytes)}</div></div>
        <div><div style="font-size:12px;color:var(--muted)">Skins propias (protegidas)</div><div style="font-size:22px;font-weight:800;color:var(--accent)">${paintData.reduce((s,c)=>s+c.ownFiles,0).toLocaleString()} archivos</div></div>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:0;flex:1;overflow:hidden;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius)">
      <div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;gap:10px;align-items:center;flex-shrink:0">
        <input class="search-input" id="paint-search" placeholder="Buscar coche…" oninput="filterPaint()" />
        <select class="sort-select" id="paint-sort" onchange="filterPaint()">
          <option value="size">Mayor tamaño</option>
          <option value="downloaded">Más descargadas</option>
          <option value="name">Nombre</option>
        </select>
      </div>
      <div id="paint-table-wrap" style="flex:1;overflow-y:auto">
        ${buildPaintTable(paintData)}
      </div>
    </div>
  `;

  buildDetailPanel();
}

function buildPaintTable(cars) {
  if (!cars.length) return '<div class="empty"><div class="empty-icon">🎨</div><div>No se encontraron skins</div></div>';
  return `
    <table class="data-table">
      <thead><tr>
        <th>Coche</th>
        <th>Total</th>
        <th>Descargadas</th>
        <th>Recuperable</th>
        <th></th>
      </tr></thead>
      <tbody>
        ${cars.map(c => `
          <tr style="cursor:pointer" onclick="openDetail('${c.id}')">
            <td>
              <div class="car-name">${c.label}</div>
              <div class="file-count">${c.files} archivos · ${c.ownFiles} propios</div>
            </td>
            <td class="num">${fmtBytes(c.bytes)}</td>
            <td class="num ${c.downloadedFiles>0?'':''}">
              ${c.downloadedFiles > 0 ? `<span style="color:var(--warn)">${c.downloadedFiles}</span>` : '<span style="color:var(--muted)">–</span>'}
            </td>
            <td class="num savings">${c.downloadedBytes > 0 ? fmtBytes(c.downloadedBytes) : '<span style="color:var(--muted)">–</span>'}</td>
            <td>
              ${c.downloadedFiles > 0
                ? `<button class="btn btn-sm btn-danger" onclick="event.stopPropagation();cleanCar('${c.id}')">Limpiar</button>`
                : `<span class="tag tag-ok">Limpio</span>`}
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function filterPaint() {
  const q = document.getElementById('paint-search').value.toLowerCase();
  const sort = document.getElementById('paint-sort').value;
  let filtered = paintData.filter(c => c.label.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
  if (sort === 'size') filtered.sort((a,b) => b.bytes - a.bytes);
  else if (sort === 'downloaded') filtered.sort((a,b) => b.downloadedFiles - a.downloadedFiles);
  else filtered.sort((a,b) => a.label.localeCompare(b.label));
  document.getElementById('paint-table-wrap').innerHTML = buildPaintTable(filtered);
}

async function cleanCar(carId) {
  showProgress('Limpiando…', 'Borrando skins descargadas');
  const r = await api.paint.deleteDownloaded(carId);
  hideProgress();
  toast(`Eliminados ${r.deleted} archivos · ${fmtBytes(r.bytes)} liberados`, 'success');
  await renderPaint();
}

async function cleanAllDownloaded() {
  const downloadedBytes = paintData.reduce((s, c) => s + c.downloadedBytes, 0);
  const downloadedFiles = paintData.reduce((s, c) => s + c.downloadedFiles, 0);
  if (!downloadedFiles) { toast('No hay skins descargadas que limpiar', 'info'); return; }
  if (!confirm(`¿Borrar ${downloadedFiles} skins descargadas (${fmtBytes(downloadedBytes)})?\n\nTus liveries propios NO se tocarán.`)) return;
  showProgress('Limpiando todo…', `${downloadedFiles} archivos`);
  const r = await api.paint.deleteAllDownloaded();
  hideProgress();
  toast(`✓ ${r.deleted} archivos eliminados · ${fmtBytes(r.bytes)} liberados`, 'success');
  await renderPaint();
}

// ── detail panel ───────────────────────────────────────────────────────────────
function buildDetailPanel() {
  if (document.getElementById('detail-panel')) return;
  const panel = document.createElement('div');
  panel.id = 'detail-panel';
  panel.innerHTML = `
    <div id="detail-header">
      <button class="btn btn-ghost btn-sm" onclick="closeDetail()">✕</button>
      <h3 id="detail-title">–</h3>
    </div>
    <div id="detail-body"></div>
    <div id="detail-footer">
      <button class="btn btn-ghost btn-sm" onclick="toggleSelectAll()">Sel. todo</button>
      <button class="btn btn-danger btn-sm" id="detail-del-sel" onclick="deleteSelected()" disabled>Borrar selección</button>
      <button class="btn btn-danger btn-sm" onclick="cleanCar(detailCarId)">Limpiar descargadas</button>
    </div>
  `;
  document.body.appendChild(panel);
}

async function openDetail(carId) {
  detailCarId = carId;
  const car = paintData.find(c => c.id === carId);
  detailFiles = await api.paint.files(carId);

  document.getElementById('detail-title').textContent = car?.label || carId;
  document.getElementById('detail-body').innerHTML = detailFiles.map(f => `
    <div class="file-row">
      <input type="checkbox" data-name="${f.name}" onchange="updateDetailSel()">
      <div class="file-info">
        <div class="file-name ${f.isOwn?'own':''}">${f.name}</div>
        <div class="file-meta">${new Date(f.mtime).toLocaleDateString('es-ES')}</div>
      </div>
      ${f.isOwn ? '<span class="own-badge">tuyo</span>' : ''}
      <div class="file-size">${fmtBytes(f.bytes)}</div>
    </div>
  `).join('');

  document.getElementById('detail-panel').classList.add('open');
  updateDetailSel();
}

function closeDetail() {
  document.getElementById('detail-panel')?.classList.remove('open');
  detailCarId = null;
}

function updateDetailSel() {
  const checked = document.querySelectorAll('#detail-body input[type=checkbox]:checked');
  const btn = document.getElementById('detail-del-sel');
  if (btn) btn.disabled = checked.length === 0;
}

function toggleSelectAll() {
  const boxes = document.querySelectorAll('#detail-body input[type=checkbox]');
  const allChecked = [...boxes].every(b => b.checked);
  boxes.forEach(b => b.checked = !allChecked);
  updateDetailSel();
}

async function deleteSelected() {
  const checked = [...document.querySelectorAll('#detail-body input[type=checkbox]:checked')];
  const names = checked.map(b => b.dataset.name);
  if (!names.length) return;
  if (!confirm(`¿Borrar ${names.length} archivo(s)?`)) return;
  showProgress('Borrando…', `${names.length} archivos`);
  const r = await api.paint.delete(detailCarId, names);
  hideProgress();
  toast(`${r.deleted} archivos eliminados · ${fmtBytes(r.bytes)}`, 'success');
  await openDetail(detailCarId);
  await renderPaintStats();
}

async function renderPaintStats() {
  paintData = await api.paint.list();
}

// ── TELEMETRY ─────────────────────────────────────────────────────────────────
async function renderTelemetry() {
  const el = document.getElementById('view-telemetry');
  el.innerHTML = `<div class="loading"><div class="spinner"></div> Cargando telemetría…</div>`;

  telemetryData = await api.telemetry.list();
  renderTelemetryView();
}

function renderTelemetryView() {
  const el = document.getElementById('view-telemetry');
  const total = telemetryData.reduce((s, f) => s + f.bytes, 0);
  const selected = getSelectedIbt();

  el.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Telemetría</div>
        <div class="page-subtitle">${telemetryData.length} archivos .ibt · ${fmtBytes(total)}</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" onclick="api.telemetry.openFolder()">📂 Abrir carpeta</button>
        <button class="btn btn-ghost" onclick="renderTelemetry()">↻ Actualizar</button>
      </div>
    </div>

    <div class="sel-toolbar ${selected.length ? '' : 'hidden'}" id="ibt-sel-toolbar">
      <span class="sel-info"><strong>${selected.length}</strong> seleccionados · <strong>${fmtBytes(selected.reduce((s,f)=>s+f.bytes,0))}</strong></span>
      <button class="btn btn-danger btn-sm" onclick="deleteSelectedIbt()">🗑 Borrar selección</button>
    </div>

    <div style="display:flex;gap:10px;margin-bottom:4px;align-items:center;flex-shrink:0">
      <input class="search-input" id="ibt-search" placeholder="Buscar coche, fecha…" oninput="filterIbt()" />
      <select class="sort-select" id="ibt-sort" onchange="filterIbt()">
        <option value="recent">Más recientes</option>
        <option value="oldest">Más antiguos</option>
        <option value="size">Mayor tamaño</option>
        <option value="car">Por coche</option>
      </select>
      <label style="font-size:13px;color:var(--muted);display:flex;align-items:center;gap:6px;cursor:pointer;margin-left:auto">
        <input type="checkbox" id="ibt-sel-all" onchange="selectAllIbt(this.checked)" style="accent-color:var(--accent)"> Sel. todos
      </label>
    </div>

    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);flex:1;overflow-y:auto" id="ibt-list">
      ${buildIbtList(telemetryData)}
    </div>
  `;
}

function buildIbtList(files) {
  if (!files.length) return '<div class="empty"><div class="empty-icon">📈</div><div>No hay archivos .ibt</div></div>';
  return files.map(f => `
    <div class="ibt-row">
      <input type="checkbox" data-name="${f.name}" onchange="onIbtCheck()" style="accent-color:var(--accent)">
      <div class="ibt-car">${f.car || f.name}</div>
      <div class="ibt-date">${f.date ? `${f.date} ${f.time}` : fmtDate(f.mtime)}</div>
      <div class="ibt-size">${fmtBytes(f.bytes)}</div>
    </div>
  `).join('');
}

function filterIbt() {
  const q = document.getElementById('ibt-search')?.value.toLowerCase() || '';
  const sort = document.getElementById('ibt-sort')?.value || 'recent';
  let filtered = telemetryData.filter(f =>
    (f.car||'').toLowerCase().includes(q) || (f.date||'').includes(q) || f.name.toLowerCase().includes(q)
  );
  if (sort === 'recent') filtered.sort((a,b) => b.mtime - a.mtime);
  else if (sort === 'oldest') filtered.sort((a,b) => a.mtime - b.mtime);
  else if (sort === 'size') filtered.sort((a,b) => b.bytes - a.bytes);
  else filtered.sort((a,b) => (a.car||'').localeCompare(b.car||''));
  document.getElementById('ibt-list').innerHTML = buildIbtList(filtered);
}

function getSelectedIbt() {
  return [...document.querySelectorAll('#ibt-list input[type=checkbox]:checked')]
    .map(b => telemetryData.find(f => f.name === b.dataset.name))
    .filter(Boolean);
}

function onIbtCheck() {
  const sel = getSelectedIbt();
  const toolbar = document.getElementById('ibt-sel-toolbar');
  if (!toolbar) return;
  if (sel.length) {
    toolbar.classList.remove('hidden');
    toolbar.querySelector('.sel-info').innerHTML = `<strong>${sel.length}</strong> seleccionados · <strong>${fmtBytes(sel.reduce((s,f)=>s+f.bytes,0))}</strong>`;
  } else {
    toolbar.classList.add('hidden');
  }
}

function selectAllIbt(checked) {
  document.querySelectorAll('#ibt-list input[type=checkbox]').forEach(b => b.checked = checked);
  onIbtCheck();
}

async function deleteSelectedIbt() {
  const sel = getSelectedIbt();
  if (!sel.length) return;
  if (!confirm(`¿Borrar ${sel.length} archivo(s) .ibt (${fmtBytes(sel.reduce((s,f)=>s+f.bytes,0))})?`)) return;
  showProgress('Borrando telemetría…', `${sel.length} archivos`);
  const r = await api.telemetry.delete(sel.map(f => f.name));
  hideProgress();
  toast(`✓ ${r.deleted} archivos eliminados · ${fmtBytes(r.bytes)} liberados`, 'success');
  await renderTelemetry();
}

// ── progress overlay ───────────────────────────────────────────────────────────
function buildProgressOverlay() {
  const d = document.createElement('div');
  d.id = 'progress-overlay';
  d.hidden = true;
  d.innerHTML = `<div class="progress-box"><div class="spinner" style="margin:0 auto 12px;width:28px;height:28px;border-width:3px"></div><h3 id="prog-title">Trabajando…</h3><p id="prog-sub"></p></div>`;
  document.body.appendChild(d);
}

function showProgress(title, sub) {
  document.getElementById('prog-title').textContent = title;
  document.getElementById('prog-sub').textContent = sub;
  document.getElementById('progress-overlay').hidden = false;
}
function hideProgress() { document.getElementById('progress-overlay').hidden = true; }

// ── toast ──────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

// ── utils ──────────────────────────────────────────────────────────────────────
function fmtBytes(b) {
  if (b >= 1e9) return (b / 1e9).toFixed(1) + ' GB';
  if (b >= 1e6) return (b / 1e6).toFixed(1) + ' MB';
  if (b >= 1e3) return (b / 1e3).toFixed(1) + ' KB';
  return b + ' B';
}

function fmtDate(ms) {
  return new Date(ms).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}
