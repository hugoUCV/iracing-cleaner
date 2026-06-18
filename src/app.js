// ── state ──────────────────────────────────────────────────────────────────────
let paintData = [], telemetryData = [], replayData = [], setupCars = [], setupFiles = [];
let selectedSetupCar = null, activeCrash = null;

// ── init ───────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupNav();
  buildProgressOverlay();
  buildNoteOverlay();
  buildDetailPanel();
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
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${name}`).classList.add('active');
  closeDetail();
  const renders = { overview, paint:renderPaint, telemetry:renderTelemetry, replays:renderReplays,
                    setups:renderSetups, configs:renderConfigs, crashes:renderCrashes, launch:renderLaunch };
  renders[name]?.();
}

// ═══════════════════════════════════════════════════════════════════════════════
// OVERVIEW
// ═══════════════════════════════════════════════════════════════════════════════
async function overview() {
  const el = eid('view-overview');
  el.innerHTML = loading('Escaneando carpetas…');
  const data = await api.disk.overview();
  const total = data.reduce((s,f) => s+f.bytes, 0);
  const maxB  = Math.max(...data.map(f=>f.bytes), 1);
  const colors = { paint:'#4f8ef7', telemetry:'#7c5ff0', replay:'#3ecf70', setups:'#f0a040', logs:'#e05252' };
  const navMap = { paint:'paint', telemetry:'telemetry', replay:'replays', setups:'setups' };
  el.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Uso del disco</div><div class="page-subtitle">Total iRacing Documents: <strong>${fmtB(total)}</strong></div></div>
      <div class="header-actions"><button class="btn btn-ghost" onclick="overview()">↻ Actualizar</button></div>
    </div>
    <div class="disk-grid">
      ${data.map(f => {
        const pct = f.bytes/maxB*100;
        const cls = f.bytes>5e9?'c-danger':f.bytes>1e9?'c-warn':'c-ok';
        const nav = navMap[f.key];
        return `<div class="disk-card" ${nav?`data-nav="${nav}" onclick="navTo('${nav}')"`:''}>
          <div class="disk-card-label">${f.label}</div>
          <div class="disk-card-size ${cls}">${fmtB(f.bytes)}</div>
          <div class="disk-card-meta">${f.files.toLocaleString()} archivos${!f.exists?' · no encontrada':''}</div>
          <div class="disk-card-bar"><div class="disk-card-fill" style="width:${pct.toFixed(1)}%;background:${colors[f.key]}"></div></div>
        </div>`;
      }).join('')}
    </div>
    <div class="card">
      <div class="card-title">Espacio recuperable</div>
      ${data.filter(f=>f.exists&&f.bytes>0&&['paint','telemetry','logs'].includes(f.key)).map(f => {
        const tips = { paint:'Skins de otros pilotos descargadas por Trading Paints — se regeneran automáticamente', telemetry:'Archivos .ibt de sesiones pasadas — bórralos cuando no los necesites', logs:'Logs y crash dumps — seguros de eliminar' };
        return `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)">
          <span style="flex:1;font-size:12px">${f.label}</span>
          <span style="font-weight:700;font-variant-numeric:tabular-nums;font-size:12px">${fmtB(f.bytes)}</span>
          <span class="tag tag-warn">Limpiable</span>
        </div><div style="font-size:11px;color:var(--muted);padding:2px 0 8px">${tips[f.key]}</div>`;
      }).join('')}
    </div>`;
}

function navTo(view) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view===view));
  showView(view);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAINT
// ═══════════════════════════════════════════════════════════════════════════════
async function renderPaint() {
  const el = eid('view-paint');
  el.innerHTML = loading('Escaneando skins…');
  paintData = await api.paint.list();
  const totalB = paintData.reduce((s,c)=>s+c.bytes,0);
  const dlB    = paintData.reduce((s,c)=>s+c.downloadedBytes,0);
  const dlF    = paintData.reduce((s,c)=>s+c.downloadedFiles,0);
  el.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Paint / Skins</div><div class="page-subtitle">${paintData.length} coches · ${fmtB(totalB)}</div></div>
      <div class="header-actions">
        <button class="btn btn-danger" onclick="cleanAllDownloaded()">🗑 Limpiar todo descargado (${fmtB(dlB)})</button>
      </div>
    </div>
    <div class="card" style="flex-shrink:0">
      <div class="stat-strip">
        <div class="stat-item"><div class="stat-label">Descargadas</div><div class="stat-value danger">${dlF.toLocaleString()} archivos</div></div>
        <div class="stat-item"><div class="stat-label">Recuperable</div><div class="stat-value success">${fmtB(dlB)}</div></div>
        <div class="stat-item"><div class="stat-label">Propias (protegidas)</div><div class="stat-value accent">${paintData.reduce((s,c)=>s+c.ownFiles,0).toLocaleString()} archivos</div></div>
      </div>
    </div>
    <div class="table-wrap">
      <div class="toolbar">
        <input class="search-input" id="paint-search" placeholder="Buscar coche…" oninput="filterPaint()" style="width:200px">
        <select class="sort-select" id="paint-sort" onchange="filterPaint()">
          <option value="size">Mayor tamaño</option>
          <option value="downloaded">Más descargadas</option>
          <option value="name">Nombre</option>
        </select>
      </div>
      <div id="paint-table-wrap" style="flex:1;overflow-y:auto">${buildPaintTable(paintData)}</div>
    </div>`;
}

function buildPaintTable(cars) {
  if (!cars.length) return emptyState('🎨','No se encontraron skins');
  return `<table class="data-table"><thead><tr>
    <th>Coche</th><th>Total</th><th>Descargadas</th><th>Recuperable</th><th></th>
  </tr></thead><tbody>${cars.map(c=>`
    <tr style="cursor:pointer" onclick="openDetail('${c.id}')">
      <td><div class="car-name">${c.label}</div><div class="file-count">${c.files} archivos · ${c.ownFiles} propios</div></td>
      <td class="num">${fmtB(c.bytes)}</td>
      <td class="num">${c.downloadedFiles>0?`<span style="color:var(--warn)">${c.downloadedFiles}</span>`:'<span style="color:var(--muted)">–</span>'}</td>
      <td class="num savings">${c.downloadedBytes>0?fmtB(c.downloadedBytes):'<span style="color:var(--muted)">–</span>'}</td>
      <td>${c.downloadedFiles>0?`<button class="btn btn-sm btn-danger" onclick="event.stopPropagation();cleanCar('${c.id}')">Limpiar</button>`:'<span class="tag tag-ok">Limpio</span>'}</td>
    </tr>`).join('')}</tbody></table>`;
}

function filterPaint() {
  const q = eid('paint-search').value.toLowerCase();
  const s = eid('paint-sort').value;
  let r = paintData.filter(c=>c.label.toLowerCase().includes(q)||c.id.toLowerCase().includes(q));
  r.sort(s==='size'?(a,b)=>b.bytes-a.bytes:s==='downloaded'?(a,b)=>b.downloadedFiles-a.downloadedFiles:(a,b)=>a.label.localeCompare(b.label));
  eid('paint-table-wrap').innerHTML = buildPaintTable(r);
}

async function cleanCar(carId) {
  showProgress('Limpiando…','Borrando skins descargadas');
  const r = await api.paint.deleteDownloaded(carId);
  hideProgress(); toast(`✓ ${r.deleted} archivos · ${fmtB(r.bytes)} liberados`,'success');
  renderPaint();
}

async function cleanAllDownloaded() {
  const dlF = paintData.reduce((s,c)=>s+c.downloadedFiles,0);
  const dlB = paintData.reduce((s,c)=>s+c.downloadedBytes,0);
  if (!dlF) { toast('No hay skins descargadas que limpiar','info'); return; }
  if (!confirm(`¿Borrar ${dlF} skins descargadas (${fmtB(dlB)})?\n\nTus liveries propios NO se tocarán.`)) return;
  showProgress('Limpiando todo…',`${dlF} archivos`);
  const r = await api.paint.deleteAllDownloaded();
  hideProgress(); toast(`✓ ${r.deleted} archivos · ${fmtB(r.bytes)} liberados`,'success');
  renderPaint();
}

// detail panel
function buildDetailPanel() {
  if (eid('detail-panel')) return;
  const p = document.createElement('div');
  p.id = 'detail-panel';
  p.innerHTML = `<div id="detail-header"><button class="btn btn-ghost btn-sm" onclick="closeDetail()">✕</button><h3 id="detail-title">–</h3></div>
    <div id="detail-body"></div>
    <div id="detail-footer">
      <button class="btn btn-ghost btn-sm" onclick="toggleSelAll()">Sel. todo</button>
      <button class="btn btn-danger btn-sm" id="detail-del-sel" onclick="deleteSelFiles()" disabled>Borrar sel.</button>
      <button class="btn btn-danger btn-sm" onclick="cleanCar(detailCarId)">Limpiar descargadas</button>
    </div>`;
  document.body.appendChild(p);
}

let detailCarId = null;
async function openDetail(carId) {
  detailCarId = carId;
  const car = paintData.find(c=>c.id===carId);
  const files = await api.paint.files(carId);
  eid('detail-title').textContent = car?.label||carId;
  eid('detail-body').innerHTML = files.map(f=>`
    <div class="file-row">
      <input type="checkbox" data-name="${f.name}" onchange="updateDetailSel()">
      <div class="file-info"><div class="file-name ${f.isOwn?'own':''}">${f.name}</div><div class="file-meta">${fmtDate(f.mtime)}</div></div>
      ${f.isOwn?'<span class="own-badge">tuyo</span>':''}
      <div class="file-size">${fmtB(f.bytes)}</div>
    </div>`).join('');
  eid('detail-panel').classList.add('open');
  updateDetailSel();
}

function closeDetail() { eid('detail-panel')?.classList.remove('open'); detailCarId=null; }
function updateDetailSel() { const n=document.querySelectorAll('#detail-body input:checked').length; const b=eid('detail-del-sel'); if(b) b.disabled=n===0; }
function toggleSelAll() { const bs=document.querySelectorAll('#detail-body input[type=checkbox]'); const a=[...bs].every(b=>b.checked); bs.forEach(b=>b.checked=!a); updateDetailSel(); }
async function deleteSelFiles() {
  const names=[...(document.querySelectorAll('#detail-body input:checked'))].map(b=>b.dataset.name);
  if (!names.length||!confirm(`¿Borrar ${names.length} archivo(s)?`)) return;
  showProgress('Borrando…','');
  const r = await api.paint.delete(detailCarId, names);
  hideProgress(); toast(`${r.deleted} archivos eliminados · ${fmtB(r.bytes)}`,'success');
  openDetail(detailCarId); paintData=await api.paint.list();
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
  const el = eid('view-telemetry');
  const total = telemetryData.reduce((s,f)=>s+f.bytes,0);
  el.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Telemetría</div><div class="page-subtitle">${telemetryData.length} archivos .ibt · ${fmtB(total)}</div></div>
      <div class="header-actions">
        <button class="btn btn-ghost" onclick="api.telemetry.openFolder()">📂 Abrir carpeta</button>
        <button class="btn btn-ghost" onclick="renderTelemetry()">↻</button>
      </div>
    </div>
    <div class="sel-toolbar hidden" id="tel-sel-bar">
      <span class="sel-info" id="tel-sel-info"></span>
      <button class="btn btn-danger btn-sm" onclick="deleteTelSel()">🗑 Borrar</button>
    </div>
    <div class="table-wrap">
      <div class="toolbar">
        <input class="search-input" id="tel-search" placeholder="Buscar coche, fecha…" oninput="filterTel()" style="width:200px">
        <select class="sort-select" id="tel-sort" onchange="filterTel()">
          <option value="recent">Más recientes</option><option value="oldest">Más antiguos</option>
          <option value="size">Mayor tamaño</option><option value="car">Por coche</option>
        </select>
        <label style="font-size:11px;color:var(--muted);display:flex;align-items:center;gap:5px;cursor:pointer;margin-left:auto">
          <input type="checkbox" id="tel-sel-all" onchange="selAllTel(this.checked)" style="accent-color:var(--accent)"> Todos
        </label>
      </div>
      <div id="tel-list" style="flex:1;overflow-y:auto">${buildFileList(telemetryData,'tel')}</div>
    </div>`;
}

function buildFileList(files, prefix) {
  if (!files.length) return emptyState('📈','No hay archivos');
  return files.map(f=>`
    <div class="file-list-row">
      <input type="checkbox" data-name="${f.name}" onchange="onCheck('${prefix}')" style="accent-color:var(--accent)">
      <div class="flr-main"><div class="flr-name">${f.car||f.session||f.name}</div><div class="flr-sub">${f.date?`${f.date} ${f.time||''}`:fmtDate(f.mtime)}</div></div>
      <div class="flr-size">${fmtB(f.bytes)}</div>
    </div>`).join('');
}

function filterTel() {
  const q=eid('tel-search').value.toLowerCase(), s=eid('tel-sort').value;
  let r=telemetryData.filter(f=>(f.car||'').toLowerCase().includes(q)||(f.date||'').includes(q)||f.name.toLowerCase().includes(q));
  r.sort(s==='recent'?(a,b)=>b.mtime-a.mtime:s==='oldest'?(a,b)=>a.mtime-b.mtime:s==='size'?(a,b)=>b.bytes-a.bytes:(a,b)=>(a.car||'').localeCompare(b.car||''));
  eid('tel-list').innerHTML=buildFileList(r,'tel');
}

function selAllTel(v) { document.querySelectorAll('#tel-list input[type=checkbox]').forEach(b=>b.checked=v); onCheck('tel'); }

function onCheck(prefix) {
  const bar=eid(`${prefix}-sel-bar`), info=eid(`${prefix}-sel-info`);
  const data = prefix==='tel'?telemetryData:replayData;
  const sel=getChecked(prefix,data);
  if (!bar) return;
  if (sel.length) { bar.classList.remove('hidden'); if(info) info.innerHTML=`<strong>${sel.length}</strong> sel. · <strong>${fmtB(sel.reduce((s,f)=>s+f.bytes,0))}</strong>`; }
  else bar.classList.add('hidden');
}

function getChecked(prefix, data) {
  const listId = prefix==='tel'?'tel-list':'rep-list';
  return [...document.querySelectorAll(`#${listId} input[type=checkbox]:checked`)].map(b=>data.find(f=>f.name===b.dataset.name)).filter(Boolean);
}

async function deleteTelSel() {
  const sel=getChecked('tel',telemetryData);
  if(!sel.length||!confirm(`¿Borrar ${sel.length} archivo(s)?`)) return;
  showProgress('Borrando…','');
  const r=await api.telemetry.delete(sel.map(f=>f.name));
  hideProgress(); toast(`✓ ${r.deleted} archivos · ${fmtB(r.bytes)}`,'success'); renderTelemetry();
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPLAYS
// ═══════════════════════════════════════════════════════════════════════════════
async function renderReplays() {
  const el = eid('view-replays');
  el.innerHTML = loading('Cargando replays…');
  replayData = await api.replays.list();
  const total = replayData.reduce((s,f)=>s+f.bytes,0);
  el.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Replays</div><div class="page-subtitle">${replayData.length} archivos · ${fmtB(total)}</div></div>
      <div class="header-actions">
        <button class="btn btn-ghost" onclick="api.replays.openFolder()">📂 Abrir carpeta</button>
        <button class="btn btn-ghost" onclick="renderReplays()">↻</button>
      </div>
    </div>
    <div class="sel-toolbar hidden" id="rep-sel-bar">
      <span class="sel-info" id="rep-sel-info"></span>
      <button class="btn btn-danger btn-sm" onclick="deleteRepSel()">🗑 Borrar</button>
    </div>
    <div class="table-wrap">
      <div class="toolbar">
        <label style="font-size:11px;color:var(--muted);display:flex;align-items:center;gap:5px;cursor:pointer;margin-left:auto">
          <input type="checkbox" id="rep-sel-all" onchange="selAllRep(this.checked)" style="accent-color:var(--accent)"> Todos
        </label>
      </div>
      <div id="rep-list" style="flex:1;overflow-y:auto">${replayData.length?buildFileList(replayData,'rep'):emptyState('🎬','No hay replays guardados')}</div>
    </div>`;
}

function selAllRep(v) { document.querySelectorAll('#rep-list input[type=checkbox]').forEach(b=>b.checked=v); onCheck('rep'); }
async function deleteRepSel() {
  const sel=getChecked('rep',replayData);
  if(!sel.length||!confirm(`¿Borrar ${sel.length} replay(s)?`)) return;
  showProgress('Borrando…','');
  const r=await api.replays.delete(sel.map(f=>f.name));
  hideProgress(); toast(`✓ ${r.deleted} archivos · ${fmtB(r.bytes)}`,'success'); renderReplays();
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETUPS
// ═══════════════════════════════════════════════════════════════════════════════
async function renderSetups() {
  const el = eid('view-setups');
  el.innerHTML = loading('Cargando setups…');
  setupCars = await api.setups.cars();
  const total = setupCars.reduce((s,c)=>s+c.count,0);
  el.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Setups</div><div class="page-subtitle">${setupCars.length} coches · ${total.toLocaleString()} archivos</div></div>
    </div>
    <div class="setup-layout">
      <div class="car-list" id="setup-car-list">${setupCars.map(c=>`
        <div class="car-item" data-id="${c.id}" onclick="selectSetupCar('${c.id}')">
          <div class="car-item-name">${c.label}</div>
          <div class="car-item-meta">${c.count} setups${c.favs?` · ★ ${c.favs}`:''}${c.count>100?` <span class="tag tag-warn" style="font-size:9px">Muchos</span>`:''}</div>
        </div>`).join('')}
      </div>
      <div class="setup-files" id="setup-files-panel">
        <div class="empty"><div class="empty-icon">🔧</div><div>Selecciona un coche</div></div>
      </div>
    </div>`;
  if (selectedSetupCar) selectSetupCar(selectedSetupCar);
}

async function selectSetupCar(carId) {
  selectedSetupCar = carId;
  document.querySelectorAll('.car-item').forEach(el=>el.classList.toggle('active',el.dataset.id===carId));
  const car = setupCars.find(c=>c.id===carId);
  const panel = eid('setup-files-panel');
  panel.innerHTML = loading('Cargando archivos…');
  setupFiles = await api.setups.files(carId);
  renderSetupFiles(car, setupFiles);
}

function renderSetupFiles(car, files) {
  const panel = eid('setup-files-panel');
  const q = eid('setup-search')?.value?.toLowerCase()||'';
  let filtered = files.filter(f=>f.name.toLowerCase().includes(q)||(f.track||'').includes(q));
  const favOnly = eid('setup-fav-only')?.checked;
  if (favOnly) filtered=filtered.filter(f=>f.fav);
  panel.innerHTML = `
    <div class="setup-files-header">
      <input class="search-input" id="setup-search" placeholder="Buscar setup o circuito…" oninput="renderSetupFiles(setupCars.find(c=>c.id===selectedSetupCar), setupFiles)" style="flex:1">
      <label style="font-size:11px;color:var(--muted);display:flex;align-items:center;gap:4px;cursor:pointer;white-space:nowrap">
        <input type="checkbox" id="setup-fav-only" onchange="renderSetupFiles(setupCars.find(c=>c.id===selectedSetupCar),setupFiles)" style="accent-color:var(--accent)"> Solo ★
      </label>
      <button class="btn btn-ghost btn-sm" onclick="api.setups.openFolder('${car?.id||selectedSetupCar}')">📂</button>
    </div>
    <div class="setup-files-body">${filtered.length ? filtered.map(f=>`
      <div class="setup-row">
        <input type="checkbox" data-name="${f.name}" onchange="onSetupCheck()">
        <div class="setup-info">
          <div class="setup-name">${f.name}</div>
          <div class="setup-sub">
            ${f.track?`<span>🏎 ${f.track}</span>`:''}
            <span>${fmtDate(f.mtime)}</span>
            ${f.note?`<span class="setup-note-inline">"${f.note}"</span>`:''}
          </div>
        </div>
        <button class="fav-btn ${f.fav?'active':''}" onclick="toggleFav('${car?.id||selectedSetupCar}','${f.name}')" title="${f.fav?'Quitar favorito':'Marcar favorito'}">${f.fav?'★':'☆'}</button>
        <div class="setup-actions">
          <button class="btn btn-sm btn-ghost" onclick="openNoteEditor('${car?.id||selectedSetupCar}','${f.name.replace(/'/g,"\\'")}','${(f.note||'').replace(/'/g,"\\'")}')">📝</button>
        </div>
      </div>`).join('') : emptyState('🔧',q?'Sin resultados':'No hay setups')}</div>
    <div id="setup-sel-bar" class="sel-toolbar hidden" style="margin:10px 14px;border-radius:var(--radius)">
      <span class="sel-info" id="setup-sel-info"></span>
      <button class="btn btn-danger btn-sm" onclick="deleteSelSetups()">🗑 Borrar</button>
    </div>`;
}

function onSetupCheck() {
  const checked = [...document.querySelectorAll('.setup-row input:checked')];
  const bar=eid('setup-sel-bar'), info=eid('setup-sel-info');
  if (!bar) return;
  if (checked.length) { bar.classList.remove('hidden'); info.innerHTML=`<strong>${checked.length}</strong> seleccionados`; }
  else bar.classList.add('hidden');
}

async function toggleFav(carId, file) {
  const isFav = await api.setups.fav(carId, file);
  const f = setupFiles.find(s=>s.name===file);
  if (f) f.fav=isFav;
  const car = setupCars.find(c=>c.id===carId);
  renderSetupFiles(car, setupFiles);
  toast(isFav?'★ Añadido a favoritos':'Quitado de favoritos','info');
}

async function deleteSelSetups() {
  const names=[...document.querySelectorAll('.setup-row input:checked')].map(b=>b.dataset.name);
  if (!names.length||!confirm(`¿Borrar ${names.length} setup(s)?`)) return;
  showProgress('Borrando…','');
  const r=await api.setups.delete(selectedSetupCar, names);
  hideProgress(); toast(`✓ ${r.deleted} archivos eliminados`,'success');
  setupFiles=await api.setups.files(selectedSetupCar);
  const car=setupCars.find(c=>c.id===selectedSetupCar); renderSetupFiles(car,setupFiles);
}

// note editor
function buildNoteOverlay() {
  if (eid('note-overlay')) return;
  const d = document.createElement('div');
  d.id='note-overlay'; d.className='note-overlay'; d.hidden=true;
  d.innerHTML=`<div class="note-box"><h4 id="note-title">Nota</h4><textarea id="note-ta" placeholder="Escribe una nota para este setup…"></textarea><div class="note-box-footer"><button class="btn btn-ghost btn-sm" onclick="closeNote()">Cancelar</button><button class="btn btn-primary btn-sm" onclick="saveNote()">Guardar</button></div></div>`;
  document.body.appendChild(d);
}

let noteCtx = {};
function openNoteEditor(carId, file, note) {
  noteCtx={carId,file}; eid('note-title').textContent=file; eid('note-ta').value=note||''; eid('note-overlay').hidden=false;
}
function closeNote() { eid('note-overlay').hidden=true; }
async function saveNote() {
  await api.setups.note(noteCtx.carId, noteCtx.file, eid('note-ta').value);
  const f=setupFiles.find(s=>s.name===noteCtx.file); if(f) f.note=eid('note-ta').value;
  closeNote(); renderSetupFiles(setupCars.find(c=>c.id===noteCtx.carId),setupFiles); toast('Nota guardada','success');
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
      <div><div class="page-title">Config Backup</div><div class="page-subtitle">Protege tus ajustes de iRacing</div></div>
      <div class="header-actions">
        <button class="btn btn-primary" onclick="createBackup()">💾 Hacer backup ahora</button>
      </div>
    </div>
    <div class="config-layout">
      <div class="card" style="display:flex;flex-direction:column;gap:0;overflow:hidden;padding:0">
        <div style="padding:12px 14px;border-bottom:1px solid var(--border)"><div class="card-title" style="margin:0">Archivos actuales</div></div>
        ${files.map(f=>`
          <div class="config-file-item">
            <span style="font-size:16px">${f.exists?'✅':'❌'}</span>
            <div style="flex:1"><div style="font-size:12px;font-weight:600">${f.name}</div><div style="font-size:10px;color:var(--muted)">${f.exists?`${fmtB(f.bytes)} · ${fmtDate(f.mtime)}`:'No encontrado'}</div></div>
          </div>`).join('')}
      </div>
      <div class="card" style="display:flex;flex-direction:column;gap:0;overflow:hidden;padding:0">
        <div style="padding:12px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
          <div class="card-title" style="margin:0">Backups guardados (${backups.length})</div>
        </div>
        <div style="flex:1;overflow-y:auto">
        ${backups.length?backups.map(b=>`
          <div class="backup-item">
            <div style="font-size:22px">💾</div>
            <div class="backup-info">
              <div class="backup-name">${b.name}</div>
              <div class="backup-meta">${fmtDate(b.date)} · ${fmtB(b.size)} · ${b.files?.length||0} archivos</div>
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-sm btn-success" onclick="restoreBackup('${b.id}')">↩ Restaurar</button>
              <button class="btn btn-sm btn-ghost" onclick="deleteBackup('${b.id}')">🗑</button>
            </div>
          </div>`).join(''):emptyState('💾','No hay backups todavía')}
        </div>
      </div>
    </div>`;
}

async function createBackup() {
  const name = prompt('Nombre para este backup (opcional):') ?? null;
  if (name === null) return;
  showProgress('Haciendo backup…','');
  const r = await api.config.backup(name||'');
  hideProgress(); toast(`✓ Backup guardado · ${r.files.length} archivos · ${fmtB(r.size)}`,'success');
  renderConfigs();
}

async function restoreBackup(id) {
  if (!confirm('¿Restaurar este backup? Los archivos actuales de iRacing serán reemplazados.')) return;
  showProgress('Restaurando…','');
  const r = await api.config.restore(id);
  hideProgress();
  if (r.ok) toast(`✓ Restaurados: ${r.files.join(', ')}`,'success');
  else toast(`Error: ${r.error}`,'error');
}

async function deleteBackup(id) {
  if (!confirm('¿Eliminar este backup?')) return;
  await api.config.deleteBackup(id); toast('Backup eliminado','info'); renderConfigs();
}

// ═══════════════════════════════════════════════════════════════════════════════
// CRASHES
// ═══════════════════════════════════════════════════════════════════════════════
async function renderCrashes() {
  const el = eid('view-crashes');
  el.innerHTML = loading('Buscando crash logs…');
  const crashes = await api.crashes.list();
  const totalB = crashes.reduce((s,c)=>s+c.bytes,0);
  el.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Crash Logs</div><div class="page-subtitle">${crashes.length} crashes · ${fmtB(totalB)}</div></div>
      <div class="header-actions">
        ${crashes.length?`<button class="btn btn-danger" onclick="deleteAllCrashes()">🗑 Borrar todos</button>`:''}
      </div>
    </div>
    <div class="crash-layout">
      <div class="crash-list-panel">
        ${crashes.length?crashes.map(c=>`
          <div class="crash-item ${activeCrash===c.base?'active':''}" onclick="showCrashLog('${c.base}','${c.log||''}')">
            <div style="font-size:12px;font-weight:600">💥 ${fmtDate(c.mtime)}</div>
            <div style="font-size:10px;color:var(--muted);margin-top:2px">${c.dmp}${c.log?` + log`:''} · ${fmtB(c.bytes)}</div>
          </div>`).join('') : emptyState('💥','Sin crashes registrados')}
      </div>
      <div class="crash-log-panel" id="crash-log-content">${crashes.length?'<span style="color:var(--muted)">Selecciona un crash para ver el log</span>':'<span style="color:var(--muted)">No hay crash dumps en la carpeta de iRacing</span>'}</div>
    </div>`;
}

async function showCrashLog(base, logName) {
  activeCrash=base;
  const panel=eid('crash-log-content');
  if (!logName) { panel.textContent='No hay archivo .log para este crash'; return; }
  panel.innerHTML='<div class="loading"><div class="spinner"></div></div>';
  const content=await api.crashes.readLog(logName);
  panel.textContent=content||'(log vacío)';
  document.querySelectorAll('.crash-item').forEach(el=>el.classList.toggle('active',el.textContent.includes(fmtDate(activeCrash))));
}

async function deleteAllCrashes() {
  const crashes=await api.crashes.list();
  const files=crashes.flatMap(c=>[c.dmp,...(c.log?[c.log]:[])]);
  if(!files.length||!confirm(`¿Borrar ${crashes.length} crash dumps y logs?`)) return;
  showProgress('Borrando…','');
  const r=await api.crashes.delete(files);
  hideProgress(); toast(`✓ ${r.deleted} archivos eliminados · ${fmtB(r.bytes)}`,'success'); activeCrash=null; renderCrashes();
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUICK LAUNCH
// ═══════════════════════════════════════════════════════════════════════════════
async function renderLaunch() {
  const el = eid('view-launch');
  el.innerHTML = loading('Buscando apps…');
  const apps = await api.launch.apps();
  const available = apps.filter(a=>a.available);
  const unavailable = apps.filter(a=>!a.available);
  el.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Lanzar</div><div class="page-subtitle">${available.length} apps encontradas</div></div>
      <div class="header-actions"><button class="btn btn-ghost" onclick="api.launch.iracingSite()">🌐 Members Site</button></div>
    </div>
    <div class="card">
      <div class="card-title">Apps disponibles</div>
      <div class="launch-grid">
        ${available.map(a=>`
          <div class="launch-card" onclick="launchApp('${a.exePath}','${a.id}')">
            <div class="launch-icon">${a.icon}</div>
            <div class="launch-label">${a.label}</div>
            <div class="launch-status">Disponible</div>
          </div>`).join('')}
        <div class="launch-card" onclick="api.launch.iracingSite()">
          <div class="launch-icon">🌐</div>
          <div class="launch-label">Members Site</div>
          <div class="launch-status">Web</div>
        </div>
        <div class="launch-card" onclick="api.launch.openFolder('C:\\\\Users\\\\${getCWDUser()}\\\\Documents\\\\iRacing')">
          <div class="launch-icon">📁</div>
          <div class="launch-label">Carpeta iRacing</div>
          <div class="launch-status">Documents</div>
        </div>
      </div>
    </div>
    ${unavailable.length?`<div class="card">
      <div class="card-title">No encontradas</div>
      <div class="launch-grid">
        ${unavailable.map(a=>`
          <div class="launch-card disabled">
            <div class="launch-icon">${a.icon}</div>
            <div class="launch-label">${a.label}</div>
            <div class="launch-status">No instalada</div>
          </div>`).join('')}
      </div>
    </div>`:''}`;
}

async function launchApp(exePath, id) {
  const cwdMap = {
    'corner-coach': getCWDPath('iracing-corner-coach'),
    'manager':      getCWDPath('iracing-manager'),
    'livery':       getCWDPath('iracing-livery-creator'),
    'photo-tool':   getCWDPath('iracing-photo-tool')
  };
  const r = await api.launch.exec(exePath, cwdMap[id]||null);
  if (r.ok) toast(`✓ Lanzando…`,'success');
  else toast('No se pudo lanzar la app','error');
}

function getCWDUser() {
  try { return window.location.pathname.split('/')[2]||'zizek'; } catch { return 'zizek'; }
}

function getCWDPath(appName) {
  return `C:\\Users\\zizek\\Documents\\${appName}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// OVERLAYS
// ═══════════════════════════════════════════════════════════════════════════════
function buildProgressOverlay() {
  if (eid('progress-overlay')) return;
  const d=document.createElement('div'); d.id='progress-overlay'; d.hidden=true;
  d.innerHTML=`<div class="progress-box"><div class="spinner" style="margin:0 auto 10px;width:26px;height:26px;border-width:3px"></div><h3 id="prog-title">Trabajando…</h3><p id="prog-sub"></p></div>`;
  document.body.appendChild(d);
}
function showProgress(t,s) { eid('prog-title').textContent=t; eid('prog-sub').textContent=s; eid('progress-overlay').hidden=false; }
function hideProgress() { eid('progress-overlay').hidden=true; }

function toast(msg, type='info') {
  const t=document.createElement('div'); t.className=`toast ${type}`; t.textContent=msg;
  eid('toast-container').appendChild(t); setTimeout(()=>t.remove(),4000);
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════════════════════
const eid = id => document.getElementById(id);
const fmtB = b => b>=1e9?(b/1e9).toFixed(1)+' GB':b>=1e6?(b/1e6).toFixed(1)+' MB':b>=1e3?(b/1e3).toFixed(1)+' KB':b+' B';
const fmtDate = ms => new Date(ms).toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'});
const loading = msg => `<div class="loading"><div class="spinner"></div>${msg}</div>`;
const emptyState = (icon,msg) => `<div class="empty"><div class="empty-icon">${icon}</div><div>${msg}</div></div>`;
