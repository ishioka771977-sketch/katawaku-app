// ============================================================
// 型知 KATACHI — フィールドノート入力 (note-input.js) v2.0
//
// v2.0 変更点:
//   - プロジェクトslug の localStorage 永続化を廃止
//   - project_master テーブル中心の運用に切替
//   - ファイル名規約: <project_id>__katachi__v<N>.{json,md}
//   - frontmatter に project_id 追加
//   - 改訂版取り込み時に旧版を _backup/ へ退避
//   - 取り込み完了後に INDEX.md を自動再生成
//
// 「📝 ノート貼り付け」ボタン:
//   1. 既存工事を選ぶ or 新規工事を登録
//   2. テキスト中の JSON ブロックを自動抽出
//   3. JSON は型知に即時反映 + Supabase projects/ に新形式で保存
//   4. 残りの自由記述は Supabase field_notes/ に保存
// ============================================================

const NI_BUCKET = 'knowledge-base';
const NI_APP = 'katachi';

// 構造種別 → 日本語ラベル / 構造系統slug
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

// ── 旧ロジック（v2.0 以降は使用されない、後方互換のため関数だけ残す） ──
//   localStorage `katachi_project_slugs` も触らない
function niEnsureProjectSlugLegacy(name) {  // eslint-disable-line no-unused-vars
  // v2.0 以降は使用されない
  return null;
}

// ── State ─────────────────────────────────────────
let _niCachedProjects = [];

async function niLoadProjects() {
  _niCachedProjects = await window.pmListProjects({ status: 'in_progress' });
  return _niCachedProjects;
}

// ── JSON 抽出 ─────────────────────────────────────
function niExtractJsonAndNote(text) {
  const result = { json: null, jsonRaw: null, note: text };
  const fenceRe = /```(?:json)?\s*\n([\s\S]*?)\n```/gi;
  const fenceMatches = [...text.matchAll(fenceRe)];
  for (const m of fenceMatches.reverse()) {
    try {
      const parsed = JSON.parse(m[1].trim());
      result.json = parsed;
      result.jsonRaw = m[1].trim();
      result.note = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).trim();
      return result;
    } catch {}
  }
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

function niCleanNote(note) {
  return (note || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^[ \t]+/gm, '')
    .trim();
}

// ── Supabase Client ─────────────────────────────
function niGetSb() { return window.getSb ? window.getSb() : null; }

// ── モーダル制御 ─────────────────────────────────
async function niOpenModal() {
  // プロジェクト一覧をリフレッシュ
  await niLoadProjects();
  niRefreshProjectSelect();
  // 構造種別: 現在の appData があればそれを既定に
  const sel = document.getElementById('niStructSelect');
  if (sel && typeof appData !== 'undefined' && appData?.structure?.type) {
    sel.value = appData.structure.type;
  }
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
  const opts = ['<option value="">（プロジェクトを選択）</option>'];
  for (const p of _niCachedProjects) {
    opts.push(`<option value="${escAttr(p.project_id)}">${escHtml(p.project_name)} — ${escHtml(p.project_id)}</option>`);
  }
  sel.innerHTML = opts.join('');
}

function escHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escAttr(s) { return escHtml(s); }

// 「+ 新規工事を登録」リンクのハンドラ
function niOpenRegisterFromNote() {
  // 工事登録モーダルを開き、登録完了したら note モーダルに戻ってリストを更新
  if (!window.prOpenModal) { alert('工事登録機能が未ロードです'); return; }
  niCloseModal();
  window.prOpenModal(async (newProject) => {
    // 登録完了 → note モーダルを再度開いて、新規プロジェクトを選択状態にする
    await niLoadProjects();
    document.getElementById('niModal').style.display = 'flex';
    niRefreshProjectSelect();
    document.getElementById('niProjectSelect').value = newProject.project_id;
  });
}

// ── プレビュー ─────────────────────────────────
async function niShowPreview() {
  const text = document.getElementById('niTextarea').value;
  if (!text.trim()) {
    niStatus('テキストが空です', 'err');
    return;
  }
  const projectId = document.getElementById('niProjectSelect').value;
  if (!projectId) {
    niStatus('プロジェクトを選択してください', 'err');
    return;
  }

  const proj = _niCachedProjects.find(p => p.project_id === projectId);
  const { json, note } = niExtractJsonAndNote(text);
  const cleanNote = niCleanNote(note);

  const structType = document.getElementById('niStructSelect').value;
  const structLabel = NI_STRUCT_LABEL[structType] || structType;

  const nextV = await window.pmDecideNextVersion(projectId, NI_APP);
  const projectFile = window.pmFilenameFor({ projectId, app: NI_APP, version: nextV, ext: 'json' });
  const noteFile = window.pmFilenameFor({ projectId, app: NI_APP, version: nextV, ext: 'md' });

  let jsonStatus = '';
  if (!json) {
    jsonStatus = '<span style="color:#e67e22">⚠ JSONブロックが見つかりませんでした（ノートのみ保存可能）</span>';
  } else {
    const issues = [];
    if (!json.project?.name && !json.project_name) issues.push('project.name');
    if (!json.structure?.type && !json.structure_type) issues.push('structure.type');
    jsonStatus = issues.length === 0
      ? '<span style="color:#27ae60">✓ 妥当性チェック: OK</span>'
      : `<span style="color:#e67e22">⚠ 不足フィールド: ${issues.join(', ')}（保存は可能）</span>`;
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
      <div>プロジェクト: <b>${escHtml(proj?.project_name || '')}</b> <code>${escHtml(projectId)}</code></div>
      <div>構造: <b>${escHtml(structLabel)}</b></div>
      <div>バージョン: <b>v${nextV}</b> ${nextV >= 2 ? '<span style="color:#e67e22">（旧版は _backup/ に退避されます）</span>' : ''}</div>
      <div>JSON保存先: <code>projects/${projectFile}</code></div>
      <div>ノート保存先: <code>field_notes/${noteFile}</code></div>
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

// ── 「取り込む」処理本体 ─────────────────────────
async function niSubmit() {
  const text = document.getElementById('niTextarea').value;
  if (!text.trim()) { niStatus('テキストが空です', 'err'); return; }

  const projectId = document.getElementById('niProjectSelect').value;
  if (!projectId) { niStatus('プロジェクトを選択してください', 'err'); return; }

  const proj = _niCachedProjects.find(p => p.project_id === projectId);
  const structType = document.getElementById('niStructSelect').value;
  const structLabel = NI_STRUCT_LABEL[structType] || structType;
  const { json, note } = niExtractJsonAndNote(text);
  const cleanNote = niCleanNote(note);

  if (!json && !cleanNote) {
    niStatus('JSON も補足ノートも検出できませんでした', 'err');
    return;
  }

  niStatus('保存中...', 'info');
  const sb = niGetSb();
  if (!sb) { niStatus('Supabase 未接続', 'err'); return; }

  const today = new Date().toISOString().slice(0, 10);
  const nextV = await window.pmDecideNextVersion(projectId, NI_APP);

  // v >= 2 なら既存最新版をバックアップ
  if (nextV >= 2) {
    niStatus('旧版を _backup/ に退避中...', 'info');
    const r = await window.pmBackupExistingVersions(projectId, NI_APP);
    console.log(`[ni] backup moved=${r.moved}`);
  }

  const results = [];
  let savedJsonPath = null, savedNotePath = null;

  // 1) JSON 保存
  if (json) {
    if (!json.project) json.project = {};
    if (!json.project.name) json.project.name = proj?.project_name || '';
    if (!json.structure) json.structure = {};
    if (!json.structure.type) json.structure.type = structType;

    const jsonFile = window.pmFilenameFor({ projectId, app: NI_APP, version: nextV, ext: 'json' });
    const jsonPath = `projects/${jsonFile}`;
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json; charset=utf-8' });
    try {
      const { error } = await sb.storage.from(NI_BUCKET).upload(jsonPath, blob, {
        upsert: true,
        contentType: 'application/json; charset=utf-8',
      });
      if (error) throw error;
      savedJsonPath = jsonPath;
      results.push(`✓ JSON保存: ${jsonPath}`);

      if (typeof initApp === 'function') {
        try { initApp(json); results.push('✓ 型知の表示を更新'); }
        catch (e) { results.push('⚠ 表示更新失敗: ' + e.message); }
      }
    } catch (e) {
      results.push('✗ JSON保存失敗: ' + (e.message || e));
    }
  }

  // 2) 補足ノート保存
  if (cleanNote) {
    const noteFile = window.pmFilenameFor({ projectId, app: NI_APP, version: nextV, ext: 'md' });
    const notePath = `field_notes/${noteFile}`;
    const author = window.__ishiokaAuth?.profile;
    const authorName = author?.display_name || author?.name || author?.employee_number || '不明';
    const authorId = author?.employee_number || 'anon';

    const noteContent = `---
date: ${today}
author: ${authorName}
author_id: ${authorId}
project_id: ${projectId}
project_name: ${proj?.project_name || ''}
struct_type: ${structLabel}
struct_slug: ${structType}
app: ${NI_APP}
version: ${nextV}
source: note_input
---

# ${proj?.project_name || ''} ${structLabel} — フィールドノート v${nextV} (${today})

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

  // 3) v3.4: json_versions テーブルにも INSERT（ファイルと並行）
  if (savedJsonPath && json && window.fnpInsertJsonVersion) {
    try {
      await window.fnpInsertJsonVersion({
        projectId,
        app: NI_APP,
        version: nextV,
        filePath: savedJsonPath,
        jsonContent: json,
        createdBy: authorId,
      });
      results.push('✓ json_versions DB登録');
    } catch (e) {
      console.warn('[ni] json_versions insert err', e);
    }
  }

  // 4) v3.4: 知見サマリー(field_note ブロック)があれば構造化して field_notes へ INSERT
  if (window.fnpExtractAndParse && window.fnpInsertToDb) {
    const blocks = window.fnpExtractAndParse(text);
    if (blocks.length > 0) {
      const fnRes = await window.fnpInsertToDb(blocks, {
        app: NI_APP,
        filePath: savedNotePath,
        fallbackProjectId: projectId,
        rawText: text,
        createdBy: authorId,
      });
      if (fnRes.ok && fnRes.inserted > 0) {
        results.push(`✓ 知見サマリー${fnRes.inserted}件保存`);
      } else if (fnRes.failedToFallback) {
        results.push(`⚠ 知見サマリー処理失敗（生データは退避済み）`);
      }
    }
  }

  // 5) INDEX 再生成
  if (savedJsonPath || savedNotePath) {
    niStatus('INDEX 更新中...', 'info');
    try {
      const r = await window.ibRebuildAllIndexes();
      if (r?.ok) results.push('✓ INDEX 更新');
    } catch (e) {
      console.warn('[ni] index rebuild err', e);
    }
  }

  const ok = (savedJsonPath || savedNotePath);
  niStatus(results.join(' / '), ok ? 'ok' : 'err');

  if (ok) {
    setTimeout(() => {
      niCloseModal();
      niShowToast(
        '✅ 取り込み完了\n'
        + (savedJsonPath ? `・型枠施工図を更新しました (v${nextV})\n` : '')
        + (savedNotePath ? '・フィールドノートを保存しました\n' : '')
        + '・INDEX を更新しました'
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
window.niOpenRegisterFromNote = niOpenRegisterFromNote;
