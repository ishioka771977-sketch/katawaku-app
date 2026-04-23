// ============================================================
// 型知 KATACHI — 共通コア (core.js)
// ============================================================

// ============================================================
// Module Registry
// ============================================================
const MODULES = {};

function registerModule(type, mod) {
  MODULES[type] = mod;
}

function getModule(type) {
  return MODULES[type] || null;
}

function getSupportedTypes() {
  return Object.keys(MODULES);
}

// Module display names
const TYPE_LABELS = {
  deck_slab: '床版',
  parapet_curb_and_barrier: '地覆・壁高欄',
  parapet: '地覆・壁高欄',
  retaining_wall: '擁壁',
  abutment: '橋台',
  pier: '橋脚',
  box_culvert: 'ボックスカルバート',
  foundation: '基礎',
};

function getTypeLabel(type) {
  return TYPE_LABELS[type] || type;
}

// ============================================================
// Global State
// ============================================================
let appData = null;
let currentView = 'welcome';
let currentFaceId = null;
let activeModule = null;
let _3dDataVersion = 0;  // incremented on each data load
let _3dRenderedVersion = -1;  // tracks which version is rendered

// ============================================================
// Saved Projects (localStorage)
// ============================================================
const STORAGE_KEY = 'katachi_saved_projects';

function getSavedProjects() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

function saveProject(data) {
  const projects = getSavedProjects();
  const p = data.project || {};
  const s = data.structure || {};
  const name = p.name || s.name || '無名工事';
  const structName = s.name || '';
  const type = s.type || '';

  // 同じ工事名+構造物名があれば上書き、なければ追加
  const key = name + '::' + structName;
  const idx = projects.findIndex(pr => (pr.projectName + '::' + pr.structName) === key);
  const entry = {
    projectName: name,
    structName: structName,
    type: type,
    savedAt: new Date().toISOString(),
    json: JSON.stringify(data)
  };

  if (idx >= 0) {
    projects[idx] = entry;
  } else {
    projects.unshift(entry); // 新しいものを先頭に
  }

  // 最大20件に制限
  while (projects.length > 20) projects.pop();

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch (e) {
    console.warn('保存に失敗（容量不足の可能性）:', e);
  }
}

function deleteSavedProject(index) {
  const projects = getSavedProjects();
  projects.splice(index, 1);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  renderSavedProjects();
}

function loadSavedProject(index) {
  const projects = getSavedProjects();
  if (!projects[index]) return;
  try {
    const data = JSON.parse(projects[index].json);
    document.getElementById('jsonInput').value = projects[index].json;
    initApp(data);
  } catch (e) {
    alert('保存データの読込みに失敗: ' + e.message);
  }
}

function renderSavedProjects() {
  const container = document.getElementById('savedProjectsList');
  if (!container) return;
  const projects = getSavedProjects();

  if (projects.length === 0) {
    container.innerHTML = '<p style="color:#999;font-size:12px;padding:8px 0">保存済みの工事はありません</p>';
    return;
  }

  let html = '<ul class="sample-list">';
  projects.forEach((pr, i) => {
    const dt = new Date(pr.savedAt);
    const dateStr = dt.toLocaleDateString('ja-JP') + ' ' + dt.toLocaleTimeString('ja-JP', {hour:'2-digit',minute:'2-digit'});
    const typeLabel = getTypeLabel(pr.type) || pr.type;
    html += `<li>
      <span class="sample-type">${esc(typeLabel)}</span>
      <span style="flex:1">
        <span style="font-weight:bold">${esc(pr.structName || pr.projectName)}</span>
        <br><span style="font-size:11px;color:#999">${esc(dateStr)}</span>
      </span>
      <button class="btn btn-success btn-sm" onclick="loadSavedProject(${i})">開く</button>
      <button class="btn btn-sm" style="background:#e74c3c;color:#fff;font-size:11px" onclick="if(confirm('削除しますか？'))deleteSavedProject(${i})">×</button>
    </li>`;
  });
  html += '</ul>';
  container.innerHTML = html;
}

// ============================================================
// JSON Loading
// ============================================================
async function loadSample(filename) {
  try {
    const resp = await fetch('sample/' + filename);
    if (resp.ok) {
      const data = await resp.json();
      document.getElementById('jsonInput').value = JSON.stringify(data, null, 2);
      initApp(data);
      return;
    }
  } catch(e) {}
  alert('サンプルJSONの読込みに失敗しました。JSONを直接貼り付けてください。');
}

function loadJSON() {
  const text = document.getElementById('jsonInput').value.trim();
  if (!text) { alert('JSONを入力してください'); return; }
  try {
    const data = JSON.parse(text);
    initApp(data);
  } catch(e) {
    alert('JSONの解析に失敗しました: ' + e.message);
  }
}

function loadFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    document.getElementById('jsonInput').value = ev.target.result;
    try {
      initApp(JSON.parse(ev.target.result));
    } catch(err) {
      alert('JSONの解析に失敗: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// ============================================================
// App Initialization
// ============================================================
function initApp(data) {
  appData = data;
  _3dDataVersion++;

  // 自動保存
  saveProject(data);

  // Detect structure type
  const structType = data.structure?.type || 'unknown';
  const mod = getModule(structType);

  if (!mod) {
    alert(`未対応の構造物タイプ: ${structType}\n\n対応済み: ${getSupportedTypes().map(t => getTypeLabel(t)).join(', ')}`);
    return;
  }

  activeModule = mod;

  // Update project info in sidebar
  const pi = document.getElementById('projectInfo');
  const p = data.project || {};
  const s = data.structure || {};
  pi.innerHTML = `<h3>プロジェクト</h3>
    <div class="info-row">工事名: <span>${esc(p.name||'')}</span></div>
    <div class="info-row">施工者: <span>${esc(p.contractor||'')}</span></div>
    <div class="info-row">構造物: <span>${esc(s.name||'')}</span></div>
    <div class="info-row">タイプ: <span class="type-badge">${esc(getTypeLabel(structType))}</span></div>
    <div class="info-row">作成日: <span>${esc(p.created_at||'')}</span></div>
    <div class="info-row">作成者: <span>${esc(p.created_by||'')}</span></div>`;

  // Enable export buttons
  document.getElementById('btnPdf').disabled = false;
  document.getElementById('btnExcel').disabled = false;

  // Let module build its views
  mod.init(data);

  // Show overview
  switchView('overview');
}

// ============================================================
// View Switching
// ============================================================
function switchView(viewId) {
  const btn = document.querySelector(`.nav-btn[data-view="${viewId}"]`);
  if (btn && btn.classList.contains('disabled')) return;

  currentView = viewId;
  document.querySelectorAll('[id^="view-"]').forEach(el => el.style.display = 'none');
  const target = document.getElementById('view-' + viewId);
  if (target) target.style.display = '';

  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  if (viewId.startsWith('face-')) {
    currentFaceId = viewId.replace('face-', '');
  } else {
    currentFaceId = null;
  }

  // Initialize 3D view (re-init when data has changed)
  if (viewId === '3d' && appData && typeof init3DView === 'function') {
    if (_3dRenderedVersion !== _3dDataVersion) {
      init3DView(appData);
      _3dRenderedVersion = _3dDataVersion;
    }
  }
}

function redrawCurrent() {
  if (activeModule && activeModule.redraw) {
    activeModule.redraw(currentView);
  }
}

// ============================================================
// Shared: Find face in data
// ============================================================
function findFace(faceId) {
  if (!appData || !appData.phases) return null;
  for (const phase of appData.phases) {
    if (phase.faces) {
      for (const face of phase.faces) {
        if (face.id === faceId) return face;
      }
    }
  }
  return null;
}

// ============================================================
// Shared: Build nav buttons for faces
// ============================================================
function buildFaceNav(data) {
  const faceNav = document.getElementById('faceNavButtons');
  faceNav.innerHTML = '';
  if (data.phases) {
    data.phases.forEach(phase => {
      (phase.faces||[]).forEach(face => {
        const btn = document.createElement('button');
        btn.className = 'nav-btn';
        btn.dataset.view = 'face-' + face.id;
        btn.onclick = () => switchView('face-' + face.id);
        const ftype = face.face_type === 'haunch' ? 'ハンチ' : '側型枠';
        btn.innerHTML = `${esc(face.id)}面 <span class="face-name">${esc(face.name||'')}</span> <span class="badge green">${ftype}</span>`;
        faceNav.appendChild(btn);
      });
    });
  }
}

// ============================================================
// Shared: Enable standard nav
// ============================================================
function enableNav() {
  document.querySelectorAll('.nav-btn[data-view="overview"]').forEach(b => b.classList.remove('disabled'));
  document.querySelectorAll('.nav-btn[data-view="quantities"]').forEach(b => b.classList.remove('disabled'));
  // Enable 3D if module supports it
  if (activeModule && activeModule.build3D) {
    document.querySelectorAll('.nav-btn[data-view="3d"]').forEach(b => b.classList.remove('disabled'));
  }
}

// ============================================================
// SVG Helpers
// ============================================================
function dimLine(x1, y1, x2, y2, label) {
  const arrowSize = 4;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#333" stroke-width="0.6"/>
    <line x1="${x1}" y1="${y1-4}" x2="${x1}" y2="${y1+4}" stroke="#333" stroke-width="0.6"/>
    <line x1="${x2}" y1="${y2-4}" x2="${x2}" y2="${y2+4}" stroke="#333" stroke-width="0.6"/>
    <polygon points="${x1},${y1} ${x1+arrowSize},${y1-arrowSize/2} ${x1+arrowSize},${y1+arrowSize/2}" fill="#333"/>
    <polygon points="${x2},${y2} ${x2-arrowSize},${y2-arrowSize/2} ${x2-arrowSize},${y2+arrowSize/2}" fill="#333"/>
    <text x="${(x1+x2)/2}" y="${y1-5}" text-anchor="middle" font-size="9" fill="#333">${label}</text>`;
}

function dimLineV(x1, y1, x2, y2, label) {
  const arrowSize = 4;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#333" stroke-width="0.6"/>
    <line x1="${x1-4}" y1="${y1}" x2="${x1+4}" y2="${y1}" stroke="#333" stroke-width="0.6"/>
    <line x1="${x2-4}" y1="${y2}" x2="${x2+4}" y2="${y2}" stroke="#333" stroke-width="0.6"/>
    <polygon points="${x1},${y1} ${x1-arrowSize/2},${y1+arrowSize} ${x1+arrowSize/2},${y1+arrowSize}" fill="#333"/>
    <polygon points="${x2},${y2} ${x2-arrowSize/2},${y2-arrowSize} ${x2+arrowSize/2},${y2-arrowSize}" fill="#333"/>
    <text x="${x1-8}" y="${(y1+y2)/2+3}" text-anchor="end" font-size="9" fill="#333">${label}</text>`;
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ============================================================
// Shared: Build Quantities View
// ============================================================
function buildQuantities(data) {
  const q = data.quantities || {};
  const el = document.getElementById('view-quantities');

  let panelRows = '';
  (q.panels?.summary||[]).forEach((r, i) => {
    panelRows += `<tr><td class="num">${i+1}</td><td>${esc(r.face)}</td><td>${esc(r.size)}</td><td>${esc(r.type)}</td><td class="num">${r.count}</td><td class="num">${r.area_m2 !== null ? r.area_m2.toFixed(2) : '—'}</td><td>${esc(r.note||'')}</td></tr>`;
  });
  panelRows += `<tr class="total-row"><td colspan="4">合計</td><td class="num">${q.panels?.total_count||0}</td><td class="num">${q.panels?.total_area_m2?.toFixed(2)||'—'}</td><td>${esc(q.panels?.note||'')}</td></tr>`;

  let sepRows = '';
  (q.separators?.summary||[]).forEach((r, i) => {
    sepRows += `<tr><td class="num">${i+1}</td><td>${esc(r.face)}</td><td>${esc(r.type)}</td><td>${esc(r.diameter)}</td><td class="num">${r.length_mm}</td><td class="num">${r.count}</td></tr>`;
  });
  sepRows += `<tr class="total-row"><td colspan="5">合計</td><td class="num">${q.separators?.total_count||0}</td></tr>`;

  const hw = q.hardware || {};
  let hwRows = '';
  if (hw.formtie) hwRows += `<tr><td>フォームタイ</td><td>${esc(hw.formtie.spec)}</td><td class="num">${hw.formtie.count}</td><td>本</td><td>${esc(hw.formtie.note||'')}</td></tr>`;
  if (hw.p_con) hwRows += `<tr><td>Pコン</td><td>${esc(hw.p_con.spec)}</td><td class="num">${hw.p_con.count}</td><td>個</td><td>${esc(hw.p_con.note||'')}</td></tr>`;
  if (hw.nut) hwRows += `<tr><td>ナット</td><td>${esc(hw.nut.spec)}</td><td class="num">${hw.nut.count}</td><td>個</td><td>${esc(hw.nut.note||'')}</td></tr>`;
  if (hw.washer) hwRows += `<tr><td>座金</td><td>${esc(hw.washer.spec)}</td><td class="num">${hw.washer.count}</td><td>枚</td><td>${esc(hw.washer.note||'')}</td></tr>`;

  let miscRows = '';
  (q.misc||[]).forEach(r => {
    miscRows += `<tr><td>${esc(r.name)}</td><td>${esc(r.spec)}</td><td class="num">${r.count}</td><td>${esc(r.unit)}</td></tr>`;
  });

  // Joint materials
  let jointRows = '';
  const jq = q.joints;
  if (jq && jq.summary) {
    jq.summary.forEach((r, i) => {
      jointRows += `<tr><td class="num">${i+1}</td><td>${esc(r.name)}</td><td>${esc(r.spec)}</td><td class="num">${r.count}</td><td>${esc(r.unit)}</td><td class="num">${r.length_m ? r.length_m.toFixed(1) : '—'}</td><td>${esc(r.note||'')}</td></tr>`;
    });
    jointRows += `<tr class="total-row"><td colspan="3">目地箇所数</td><td class="num" colspan="4">${jq.total_joints||0} 箇所</td></tr>`;
  }

  el.innerHTML = `
    <div class="card">
      <div class="card-header">型枠割付数量表</div>
      <div class="card-body">
        <table class="qty-table">
          <thead><tr><th>No</th><th>面名</th><th>サイズ(mm)</th><th>定/カット</th><th>枚数</th><th>面積m2</th><th>備考</th></tr></thead>
          <tbody>${panelRows}</tbody>
        </table>
      </div>
    </div>
    <div class="card">
      <div class="card-header">セパ・金物数量表</div>
      <div class="card-body">
        <table class="qty-table">
          <thead><tr><th>No</th><th>面名</th><th>種類</th><th>径</th><th>長さmm</th><th>数量</th></tr></thead>
          <tbody>${sepRows}</tbody>
        </table>
        ${hwRows ? `<h4 style="margin-top:16px;margin-bottom:8px">金物</h4>
        <table class="qty-table">
          <thead><tr><th>品名</th><th>規格</th><th>数量</th><th>単位</th><th>備考</th></tr></thead>
          <tbody>${hwRows}</tbody>
        </table>` : ''}
      </div>
    </div>
    ${miscRows ? `<div class="card">
      <div class="card-header">その他資材</div>
      <div class="card-body">
        <table class="qty-table">
          <thead><tr><th>品名</th><th>規格</th><th>数量</th><th>単位</th></tr></thead>
          <tbody>${miscRows}</tbody>
        </table>
      </div>
    </div>` : ''}
    ${jointRows ? `<div class="card">
      <div class="card-header">目地関連材料</div>
      <div class="card-body">
        <table class="qty-table">
          <thead><tr><th>No</th><th>品名</th><th>規格</th><th>数量</th><th>単位</th><th>長さm</th><th>備考</th></tr></thead>
          <tbody>${jointRows}</tbody>
        </table>
      </div>
    </div>` : ''}`;
}

// ============================================================
// Shared: PDF Export (A3 Landscape)
// ============================================================
function exportPDF() {
  if (!appData || !activeModule) { alert('データがありません'); return; }
  if (activeModule.exportPDF) {
    activeModule.exportPDF(appData);
  } else {
    alert('このモジュールはPDF出力に未対応です');
  }
}

// ============================================================
// Shared: Excel Export
// ============================================================
function exportExcel() {
  if (!appData || !appData.quantities) { alert('データがありません'); return; }

  const q = appData.quantities;
  const p = appData.project || {};
  const wb = XLSX.utils.book_new();

  // Sheet 1: Panel Quantities
  const panelData = [
    [`${p.name||''} — 型枠割付数量表`],
    [],
    ['No', '面名', 'サイズ(mm)', '定/カット', '枚数', '面積m2', '備考']
  ];
  (q.panels?.summary||[]).forEach((r, i) => {
    panelData.push([i+1, r.face, r.size, r.type, r.count, r.area_m2, r.note||'']);
  });
  panelData.push([]);
  panelData.push(['', '', '', '合計', q.panels?.total_count||0, q.panels?.total_area_m2||0, q.panels?.note||'']);
  const ws1 = XLSX.utils.aoa_to_sheet(panelData);
  ws1['!cols'] = [{wch:5},{wch:12},{wch:16},{wch:10},{wch:8},{wch:10},{wch:30}];
  XLSX.utils.book_append_sheet(wb, ws1, '型枠割付数量表');

  // Sheet 2: Separator & Hardware
  const sepData = [
    [`${p.name||''} — セパ・金物数量表`],
    [],
    ['No', '面名', '種類', '径', '長さ(mm)', '数量']
  ];
  (q.separators?.summary||[]).forEach((r, i) => {
    sepData.push([i+1, r.face, r.type, r.diameter, r.length_mm, r.count]);
  });
  sepData.push([]);
  sepData.push(['', '', '', '', '合計', q.separators?.total_count||0]);
  sepData.push([]);
  sepData.push(['金物']);
  sepData.push(['品名', '規格', '数量', '単位', '備考']);
  const hw = q.hardware||{};
  if (hw.formtie) sepData.push(['フォームタイ', hw.formtie.spec, hw.formtie.count, '本', hw.formtie.note||'']);
  if (hw.p_con) sepData.push(['Pコン', hw.p_con.spec, hw.p_con.count, '個', hw.p_con.note||'']);
  if (hw.nut) sepData.push(['ナット', hw.nut.spec, hw.nut.count, '個', hw.nut.note||'']);
  if (hw.washer) sepData.push(['座金', hw.washer.spec, hw.washer.count, '枚', hw.washer.note||'']);
  const ws2 = XLSX.utils.aoa_to_sheet(sepData);
  ws2['!cols'] = [{wch:5},{wch:12},{wch:12},{wch:10},{wch:12},{wch:8}];
  XLSX.utils.book_append_sheet(wb, ws2, 'セパ・金物数量表');

  // Sheet 3: Material Order List
  const orderData = [
    [`${p.name||''} — 材料手配表`],
    [`施工者: ${p.contractor||''}`, '', '', `作成日: ${p.created_at||''}`],
    [],
    ['品名', '規格', '数量', '単位', '納入日', '備考']
  ];
  const panelSizes = {};
  (q.panels?.summary||[]).forEach(r => {
    const key = r.size;
    if (!panelSizes[key]) panelSizes[key] = { size: r.size, type: r.type, count: 0 };
    panelSizes[key].count += r.count;
  });
  Object.values(panelSizes).forEach(ps => {
    orderData.push(['コンパネ', `t12 ${ps.size}`, ps.count, '枚', '', ps.type==='カット'?'カット材':'定尺']);
  });
  const sepSizes = {};
  (q.separators?.summary||[]).forEach(r => {
    const key = `${r.type}_${r.diameter}_${r.length_mm}`;
    if (!sepSizes[key]) sepSizes[key] = { type: r.type, diameter: r.diameter, length_mm: r.length_mm, count: 0 };
    sepSizes[key].count += r.count;
  });
  Object.values(sepSizes).forEach(ss => {
    orderData.push([`${ss.type}セパ`, `${ss.diameter} L=${ss.length_mm}`, ss.count, '本', '', '']);
  });
  if (hw.formtie) orderData.push(['フォームタイ', hw.formtie.spec, hw.formtie.count, '本', '', '']);
  if (hw.p_con) orderData.push(['Pコン', hw.p_con.spec, hw.p_con.count, '個', '', '']);
  if (hw.nut) orderData.push(['ナット', hw.nut.spec, hw.nut.count, '個', '', '']);
  if (hw.washer) orderData.push(['座金', hw.washer.spec, hw.washer.count, '枚', '', '']);
  (q.misc||[]).forEach(r => {
    orderData.push([r.name, r.spec, r.count, r.unit, '', '']);
  });
  const ws3 = XLSX.utils.aoa_to_sheet(orderData);
  ws3['!cols'] = [{wch:16},{wch:20},{wch:8},{wch:6},{wch:12},{wch:20}];
  XLSX.utils.book_append_sheet(wb, ws3, '材料手配表');

  const filename = `${p.name||'formwork'}_材料表_${p.created_at||'draft'}.xlsx`;
  XLSX.writeFile(wb, filename);
}

// ============================================================
// Shared: PDF Header/Footer
// ============================================================
function pdfDrawHeaderFooter(doc, title, pageNum, totalPages) {
  const pw = 420, ph = 297, m = 15;
  const p = appData?.project || {};
  doc.setFillColor(26, 82, 118);
  doc.rect(m, m, pw - m*2, 12, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(p.name || '', m + 4, m + 8);
  doc.setFontSize(9);
  doc.text(title, pw/2, m + 8, { align: 'center' });
  doc.text(`${pageNum}/${totalPages}`, pw - m - 4, m + 8, { align: 'right' });
  doc.setDrawColor(200);
  doc.line(m, ph - m - 6, pw - m, ph - m - 6);
  doc.setFontSize(7);
  doc.setTextColor(100);
  doc.text(`Created by: ${p.created_by||''}  |  Checked by:          |  ${p.created_at||''}`, m + 2, ph - m - 1);
  doc.text(`${p.contractor||''}`, pw - m - 2, ph - m - 1, { align: 'right' });
}
