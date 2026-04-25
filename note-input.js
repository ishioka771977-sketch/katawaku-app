// ============================================================
// 型知 KATACHI — フィールドノート入力 (note-input.js)
//   仕様書 v3.3 (2026-04-25) Phase 1 実装
//
// 「📝 ノート貼り付け」ボタン:
//   1. テキスト中の JSON ブロックを自動抽出
//   2. JSON は型知に即時反映 + Supabase projects/ に保存
//   3. 残りの自由記述は Supabase field_notes/ に保存
//   4. localStorage にも従来どおり自動保存（オフライン用）
// ============================================================

const NI_BUCKET = 'knowledge-base';
const NI_PROJECT_SLUGS_KEY = 'katachi_project_slugs';  // {日本語名: 英数slug} のマップ

// 構造物タイプ → スラッグ（knowledge-base.js と同じ）
const NI_STRUCT_SLUG = {
  deck_slab: 'slab',
  parapet: 'parapet',
  parapet_curb_and_barrier: 'parapet',
  retaining_wall: 'wall',
  abutment: 'abutment',
  pier: 'pier',
  box_culvert: 'box',
  foundation: 'foundation',
};
const NI_STRUCT_LABEL = {
  deck_slab: '床版',
  parapet: '地覆・壁高欄',
  parapet_curb_and_barrier: '地覆・壁高欄',
  retaining_wall: '擁壁',
  abutment: '橋台',
  pier: '橋脚',
  box_culvert: 'BOXカルバート',
  foundation: '基礎',
};

// ────────────────────────────────────────────
// プロジェクト名 ↔ スラッグ管理
// ────────────────────────────────────────────
function niGetSlugMap() {
  try { return JSON.parse(localStorage.getItem(NI_PROJECT_SLUGS_KEY) || '{}'); }
  catch { return {}; }
}
function niSaveSlugMap(map) {
  localStorage.setItem(NI_PROJECT_SLUGS_KEY, JSON.stringify(map));
}
function niEnsureProjectSlug(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return 'p_unknown';
  const map = niGetSlugMap();
  if (map[trimmed]) return map[trimmed];
  // 新規発行
  const slug = 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  map[trimmed] = slug;
  niSaveSlugMap(map);
  return slug;
}

// ────────────────────────────────────────────
// JSON 抽出ロジック
// ────────────────────────────────────────────
function niExtractJsonAndNote(text) {
  // 戻り値: { json: object|null, jsonRaw: string|null, note: string }
  const result = { json: null, jsonRaw: null, note: text };

  // パターンA: ```json ... ``` または ``` ... ```
  const fenceRe = /```(?:json)?\s*\n([\s\S]*?)\n```/gi;
  const fenceMatches = [...text.matchAll(fenceRe)];
  for (const m of fenceMatches.reverse()) {  // 後ろから = 修正版優先
    try {
      const parsed = JSON.parse(m[1].trim());
      result.json = parsed;
      result.jsonRaw = m[1].trim();
      // テキストから JSON ブロックを除去
      result.note = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).trim();
      return result;
    } catch {}
  }

  // パターンB: 生 { ... } の bracket scan
  const startIdx = text.indexOf('{');
  if (startIdx >= 0) {
    let depth = 0, inStr = false, escape = false;
    for (let i = startIdx; i < text.length; i++) {
      const c = text[i];
      if (escape) { escape = false; continue; }
      if (c === '\\') { escape = true; continue; }
      if (c === '"' && !escape) inStr = !inStr;
      if (inStr) continue;
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          const raw = text.slice(startIdx, i + 1);
          try {
            result.json = JSON.parse(raw);
            result.jsonRaw = raw;
            result.note = (text.slice(0, startIdx) + text.slice(i + 1)).trim();
            return result;
          } catch {}
          break;
        }
      }
    }
  }
  return result;
}

// 補足ノートの整形
function niCleanNote(note) {
  return (note || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')   // 連続空行を1行に
    .replace(/^[ \t]+/gm, '')      // 行頭の余計な空白
    .trim();
}

// ────────────────────────────────────────────
// Supabase Client
// ────────────────────────────────────────────
function niGetSb() { return window.getSb ? window.getSb() : null; }

// ────────────────────────────────────────────
// モーダル制御
// ────────────────────────────────────────────
function niOpenModal() {
  // セレクト初期化
  niRefreshProjectSelect();
  // 構造種別: 現在の appData があればそれを既定に
  const sel = document.getElementById('niStructSelect');
  if (sel && typeof appData !== 'undefined' && appData?.structure?.type) {
    sel.value = appData.structure.type;
  }
  // テキストエリアクリア
  document.getElementById('niTextarea').value = '';
  document.getElementById('niStatus').textContent = '';
  document.getElementById('niPreview').style.display = 'none';
  document.getElementById('niModal').style.display = 'flex';
}

function niCloseModal() {
  document.getElementById('niModal').style.display = 'none';
}

function niRefreshProjectSelect() {
  const sel = document.getElementById('niProjectSelect');
  if (!sel) return;
  const projects = (typeof getSavedProjects === 'function') ? getSavedProjects() : [];
  const names = [...new Set(projects.map(p => p.projectName).filter(Boolean))];
  sel.innerHTML = '<option value="">（新規入力）</option>'
    + names.map(n => `<option value="${escAttr(n)}">${escHtml(n)}</option>`).join('');
}

function escHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escAttr(s) { return escHtml(s); }

// プロジェクト名取得（セレクト > 自由入力 の順）
function niResolveProjectName() {
  const sel = document.getElementById('niProjectSelect').value.trim();
  const free = document.getElementById('niProjectFreeInput').value.trim();
  return free || sel;
}

// ────────────────────────────────────────────
// プレビュー表示
// ────────────────────────────────────────────
function niShowPreview() {
  const text = document.getElementById('niTextarea').value;
  if (!text.trim()) {
    niStatus('テキストが空です', 'err');
    return;
  }
  const { json, jsonRaw, note } = niExtractJsonAndNote(text);
  const cleanNote = niCleanNote(note);

  const projName = niResolveProjectName() || '(未指定)';
  const structType = document.getElementById('niStructSelect').value;
  const structLabel = NI_STRUCT_LABEL[structType] || structType;

  const projSlug = niEnsureProjectSlug(projName);
  const structSlug = NI_STRUCT_SLUG[structType] || 'other';
  const today = new Date().toISOString().slice(0, 10);
  const projectFilename = `${today}_${projSlug}_${structSlug}.json`;
  const noteFilename = `${today}_${projSlug}_${structSlug}_${Date.now().toString(36)}.md`;

  // JSON の妥当性
  let jsonStatus = '';
  if (!json) {
    jsonStatus = '<span style="color:#e67e22">⚠ JSONブロックが見つかりませんでした（ノートのみ保存可能）</span>';
  } else {
    const issues = [];
    if (!json.project?.name && !json.project_name) issues.push('project.name');
    if (!json.structure?.type && !json.structure_type) issues.push('structure.type');
    if (issues.length === 0) {
      jsonStatus = '<span style="color:#27ae60">✓ 妥当性チェック: OK</span>';
    } else {
      jsonStatus = `<span style="color:#e67e22">⚠ 不足フィールド: ${issues.join(', ')}（保存は可能）</span>`;
    }
  }

  const pv = document.getElementById('niPreview');
  pv.innerHTML = `
    <h4 style="font-size:13px;color:#1a5276;margin:8px 0 4px">▼ 抽出されたJSON（型知に反映される）</h4>
    <pre style="background:#f8f9fa;border:1px solid #ddd;border-radius:4px;padding:8px;font-size:11px;max-height:160px;overflow:auto;white-space:pre-wrap">${
      json ? escHtml(JSON.stringify(json, null, 2)) : '<em style="color:#999">（なし）</em>'
    }</pre>
    <div style="font-size:12px;margin:6px 0">${jsonStatus}</div>

    <h4 style="font-size:13px;color:#1a5276;margin:12px 0 4px">▼ 補足ノート（field_notes に保存される）</h4>
    <pre style="background:#fff8e1;border-left:4px solid #f39c12;padding:8px;font-size:12px;max-height:160px;overflow:auto;white-space:pre-wrap">${
      cleanNote ? escHtml(cleanNote) : '<em style="color:#999">（なし）</em>'
    }</pre>

    <div style="font-size:11px;color:#666;margin-top:8px;line-height:1.6">
      <div>プロジェクト: <b>${escHtml(projName)}</b> (slug: <code>${projSlug}</code>)</div>
      <div>構造: <b>${escHtml(structLabel)}</b> (slug: <code>${structSlug}</code>)</div>
      <div>JSON保存先: <code>projects/${projectFilename}</code></div>
      <div>ノート保存先: <code>field_notes/${noteFilename}</code></div>
    </div>
  `;
  pv.style.display = 'block';
  niStatus('プレビュー生成しました。問題なければ「取り込む」を押してください。', 'ok');
}

function niStatus(msg, type) {
  const st = document.getElementById('niStatus');
  if (!st) return;
  st.textContent = msg;
  st.style.color = type === 'err' ? '#c0392b' : type === 'ok' ? '#27ae60' : '#666';
}

// ────────────────────────────────────────────
// 「取り込む」処理本体
// ────────────────────────────────────────────
async function niSubmit() {
  const text = document.getElementById('niTextarea').value;
  if (!text.trim()) { niStatus('テキストが空です', 'err'); return; }

  const projName = niResolveProjectName();
  const structType = document.getElementById('niStructSelect').value;
  if (!projName) { niStatus('プロジェクト名を入力してください', 'err'); return; }

  const { json, note } = niExtractJsonAndNote(text);
  const cleanNote = niCleanNote(note);

  if (!json && !cleanNote) {
    niStatus('JSON も補足ノートも検出できませんでした', 'err');
    return;
  }

  const projSlug = niEnsureProjectSlug(projName);
  const structSlug = NI_STRUCT_SLUG[structType] || 'other';
  const structLabel = NI_STRUCT_LABEL[structType] || structType;
  const today = new Date().toISOString().slice(0, 10);

  niStatus('保存中...', 'info');
  const sb = niGetSb();
  if (!sb) { niStatus('Supabase 未接続', 'err'); return; }

  const results = [];
  let savedJsonPath = null, savedNotePath = null;

  // 1) JSON を Supabase + localStorage に保存
  if (json) {
    // 元データに project/structure メタを補完
    if (!json.project) json.project = {};
    if (!json.project.name) json.project.name = projName;
    if (!json.structure) json.structure = {};
    if (!json.structure.type) json.structure.type = structType;

    const jsonPath = `projects/${today}_${projSlug}_${structSlug}.json`;
    const jsonStr = JSON.stringify(json, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json; charset=utf-8' });
    try {
      const { error } = await sb.storage.from(NI_BUCKET).upload(jsonPath, blob, {
        upsert: true,
        contentType: 'application/json; charset=utf-8',
      });
      if (error) throw error;
      savedJsonPath = jsonPath;
      results.push(`✓ JSON保存: ${jsonPath}`);

      // 型知の表示更新（既存 initApp を流用）
      if (typeof initApp === 'function') {
        try { initApp(json); results.push('✓ 型知の表示を更新'); }
        catch (e) { results.push('⚠ 表示更新失敗: ' + e.message); }
      }
    } catch (e) {
      results.push('✗ JSON保存失敗: ' + (e.message || e));
    }
  }

  // 2) 補足ノートを Supabase に保存
  if (cleanNote) {
    const ts = Date.now().toString(36);
    const notePath = `field_notes/${today}_${projSlug}_${structSlug}_${ts}.md`;
    const author = window.__ishiokaAuth?.profile;
    const authorName = author?.display_name || author?.name || author?.employee_number || '不明';
    const authorId = author?.employee_number || 'anon';

    const noteContent = `---
date: ${today}
author: ${authorName}
author_id: ${authorId}
project_name: ${projName}
project_slug: ${projSlug}
struct_type: ${structLabel}
struct_slug: ${structSlug}
app: katachi
source: note_input
---

# ${projName} ${structLabel} — フィールドノート (${today})

## 補足ノート

${cleanNote}

${savedJsonPath ? `\n---\n\n## 関連JSONファイル\n\n- \`${savedJsonPath}\`（最終更新: ${today}）\n` : ''}`;

    const blob = new Blob([noteContent], { type: 'text/markdown; charset=utf-8' });
    try {
      const { error } = await sb.storage.from(NI_BUCKET).upload(notePath, blob, {
        upsert: true,
        contentType: 'text/markdown; charset=utf-8',
      });
      if (error) throw error;
      savedNotePath = notePath;
      results.push(`✓ ノート保存: ${notePath}`);
    } catch (e) {
      results.push('✗ ノート保存失敗: ' + (e.message || e));
    }
  }

  // 完了表示
  const ok = (savedJsonPath || savedNotePath);
  niStatus(results.join(' / '), ok ? 'ok' : 'err');

  if (ok) {
    // トースト表示 + モーダルを閉じる
    setTimeout(() => {
      niCloseModal();
      niShowToast(
        '✅ 取り込み完了\n'
        + (savedJsonPath ? '・型枠施工図を更新しました\n' : '')
        + (savedNotePath ? '・フィールドノートを保存しました' : '')
      );
    }, 1500);
  }
}

function niShowToast(message) {
  const t = document.createElement('div');
  t.style.cssText = 'position:fixed;bottom:30px;right:30px;background:#27ae60;color:#fff;padding:14px 20px;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.3);z-index:10000;white-space:pre-line;font-size:13px;line-height:1.6;max-width:360px';
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .5s'; t.style.opacity = '0'; }, 4500);
  setTimeout(() => t.remove(), 5200);
}

// グローバル公開
window.niOpenModal = niOpenModal;
window.niCloseModal = niCloseModal;
window.niShowPreview = niShowPreview;
window.niSubmit = niSubmit;
