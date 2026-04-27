// ============================================================
// 型知 v2.0 — 工事登録モーダル (project-register.js)
//   仕様書: 2026-04-27 v2.0 第4章
// ============================================================

let _prCallback = null;

function prOpenModal(callback) {
  _prCallback = callback || null;
  const m = document.getElementById('prModal');
  if (!m) return;
  // 初期化
  document.getElementById('prName').value = '';
  document.getElementById('prLocation').value = '';
  document.getElementById('prContractor').value = '';
  document.getElementById('prStartDate').value = new Date().toISOString().slice(0, 10);
  document.getElementById('prPlannedEnd').value = '';
  document.getElementById('prStructFamily').value = 'slab';
  document.getElementById('prProjectId').value = '';
  document.getElementById('prStatus').textContent = '';
  m.style.display = 'flex';
  // 工事名入力で project_id を自動候補表示
  setTimeout(() => document.getElementById('prName').focus(), 50);
}

function prCloseModal() {
  const m = document.getElementById('prModal');
  if (m) m.style.display = 'none';
  _prCallback = null;
}

// 工事名 or 構造系統が変わったら project_id 候補を再生成
function prRefreshProjectId() {
  const name = document.getElementById('prName').value.trim();
  const fam = document.getElementById('prStructFamily').value;
  if (!name) {
    document.getElementById('prProjectId').value = '';
    document.getElementById('prProjectIdHint').textContent = '工事名を入力すると自動候補を生成します';
    return;
  }
  const id = window.pmGenerateProjectId(name, fam);
  document.getElementById('prProjectId').value = id;
  document.getElementById('prProjectIdHint').textContent =
    '※ 必要に応じて編集できます（英数字・アンダースコアのみ）';
}

async function prSubmit() {
  const st = document.getElementById('prStatus');
  const name = document.getElementById('prName').value.trim();
  const start = document.getElementById('prStartDate').value;
  const end = document.getElementById('prPlannedEnd').value;
  const projectIdInput = document.getElementById('prProjectId').value.trim();
  if (!name) { st.style.color = '#c0392b'; st.textContent = '⚠ 工事名は必須です'; return; }
  if (!start) { st.style.color = '#c0392b'; st.textContent = '⚠ 工期開始日は必須です'; return; }

  // project_id をサニタイズ
  let projectId = (projectIdInput || window.pmGenerateProjectId(name, document.getElementById('prStructFamily').value))
    .replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
  if (!projectId) { st.style.color = '#c0392b'; st.textContent = '⚠ project_id が空です'; return; }

  // 衝突回避
  st.style.color = '#666'; st.textContent = '登録中...';
  try {
    projectId = await window.pmEnsureUniqueProjectId(projectId);
    const record = await window.pmInsertProject({
      project_id: projectId,
      project_name: name,
      location: document.getElementById('prLocation').value.trim() || null,
      contractor: document.getElementById('prContractor').value.trim() || null,
      start_date: start,
      planned_end_date: end || null,
    });
    st.style.color = '#27ae60';
    st.innerHTML = `✓ 登録完了: <code>${record.project_id}</code>`;
    setTimeout(() => {
      const cb = _prCallback;
      prCloseModal();
      if (cb) cb(record);
    }, 1200);
  } catch (e) {
    console.error(e);
    st.style.color = '#c0392b';
    st.textContent = '❌ 登録失敗: ' + (e.message || e);
  }
}

window.prOpenModal = prOpenModal;
window.prCloseModal = prCloseModal;
window.prRefreshProjectId = prRefreshProjectId;
window.prSubmit = prSubmit;
