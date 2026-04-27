// ============================================================
// 型知 v3.4 — 知見サマリーパース (field-note-parser.js)
//   仕様書: 2026-04-27 v3.4 第3章
//
// 提供する関数:
//   - fnpExtractAndParse(text): 貼付テキストから知見サマリーを抽出+構造化
//   - fnpInsertToDb(parsed, opts): field_notes テーブルへ INSERT
//   - fnpFallbackToFailed(rawText, err): 失敗時の field_notes_failed 退避
// ============================================================

const FNP_TABLE = 'field_notes';
const FNP_FAILED_TABLE = 'field_notes_failed';

// ── ブロック抽出 ────────────────────────────────────
//   ---field_note_start--- ... ---field_note_end---
const FNP_BLOCK_RE = /---field_note_start---([\s\S]*?)---field_note_end---/g;

function fnpExtractBlocks(text) {
  const blocks = [];
  for (const m of text.matchAll(FNP_BLOCK_RE)) {
    blocks.push(m[1].trim());
  }
  return blocks;
}

// ── 簡易 YAML パーサ（フォーマット固定前提）─────────
// 入力例:
//   project_id: prj_2026_shukunobe_slab
//   project_name: 宿野辺橋床版工事
//   date: 2026-04-25
//   items:
//     - category: セパ
//       title: 中央割の決定基準
//       content: 美観のため壁高欄は中央割推奨
//       source: この会話
//     - category: 目地
//       ...
function fnpParseYaml(yamlText) {
  const result = { project_id: '', project_name: '', date: '', items: [] };
  const lines = yamlText.split('\n');
  let i = 0;

  // トップレベルのキー: items 以外
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) { i++; continue; }

    // items: 開始
    if (/^items\s*:/.test(trimmed)) {
      i++;
      // items の中身（- で始まるオブジェクト配列）
      let cur = null;
      while (i < lines.length) {
        const lline = lines[i];
        const t = lline.trim();
        if (!t) { i++; continue; }
        // 新しい item 開始
        const itemStart = lline.match(/^\s*-\s+(\w+)\s*:\s*(.*)$/);
        if (itemStart) {
          if (cur) result.items.push(cur);
          cur = {};
          cur[itemStart[1]] = itemStart[2].trim();
          i++;
          continue;
        }
        // item の続きキー
        const itemKv = lline.match(/^\s+(\w+)\s*:\s*(.*)$/);
        if (itemKv && cur) {
          cur[itemKv[1]] = itemKv[2].trim();
          i++;
          continue;
        }
        // 不明行はスキップ
        i++;
      }
      if (cur) result.items.push(cur);
      break;
    }

    // トップレベル key: value
    const kv = trimmed.match(/^(\w+)\s*:\s*(.*)$/);
    if (kv) {
      const k = kv[1];
      const v = kv[2].trim();
      if (k === 'project_id') result.project_id = v;
      else if (k === 'project_name') result.project_name = v;
      else if (k === 'date') result.date = v;
    }
    i++;
  }

  // items: [] の空配列リテラル対応
  if (yamlText.match(/items\s*:\s*\[\s*\]/)) {
    result.items = [];
  }
  return result;
}

/**
 * 貼付テキスト全体から知見サマリーを抽出+構造化。
 * 戻り値: 抽出ブロック配列（各要素は parseYaml の結果）
 */
function fnpExtractAndParse(text) {
  const blocks = fnpExtractBlocks(text);
  return blocks.map(b => fnpParseYaml(b));
}

// ── DB INSERT ──────────────────────────────────────
function fnpSb() { return window.getSb ? window.getSb() : null; }

/**
 * 抽出されたブロック群を field_notes テーブルへ INSERT。
 * @param {Array} parsedBlocks - fnpExtractAndParse の戻り値
 * @param {Object} opts - { app: 'katachi'|'tetchi', filePath?: string, fallbackProjectId?: string, rawText?: string, createdBy?: string }
 * @returns {Promise<{ ok: boolean, inserted: number, failedToFallback: boolean, error?: string }>}
 */
async function fnpInsertToDb(parsedBlocks, opts) {
  const sb = fnpSb();
  if (!sb) return { ok: false, inserted: 0, failedToFallback: false, error: 'no-sb' };

  const rows = [];
  for (const blk of parsedBlocks) {
    const projectId = blk.project_id || opts.fallbackProjectId || null;
    const items = Array.isArray(blk.items) ? blk.items : [];
    if (items.length === 0) continue;
    for (const it of items) {
      rows.push({
        project_id: projectId,
        app: opts.app || 'unknown',
        category: it.category || 'その他',
        title: it.title || '(無題)',
        content: it.content || '',
        source: it.source || null,
        raw_session_text: opts.rawText || null,
        file_path: opts.filePath || null,
        created_by: opts.createdBy || null,
      });
    }
  }

  if (rows.length === 0) {
    return { ok: true, inserted: 0, failedToFallback: false };
  }

  try {
    const { error } = await sb.from(FNP_TABLE).insert(rows);
    if (error) throw error;
    return { ok: true, inserted: rows.length, failedToFallback: false };
  } catch (e) {
    console.error('[fnp] insert err', e);
    // 失敗時は raw_text を退避
    try {
      await sb.from(FNP_FAILED_TABLE).insert({
        raw_text: opts.rawText || JSON.stringify(parsedBlocks),
        project_id: opts.fallbackProjectId || null,
        app: opts.app || null,
        error_message: (e && e.message) || String(e),
      });
      return { ok: false, inserted: 0, failedToFallback: true, error: e.message };
    } catch (e2) {
      return { ok: false, inserted: 0, failedToFallback: false, error: 'double-fail: ' + e2.message };
    }
  }
}

// ── json_versions への INSERT ─────────────────────
async function fnpInsertJsonVersion({ projectId, app, version, filePath, jsonContent, createdBy }) {
  const sb = fnpSb();
  if (!sb) return { ok: false };
  try {
    const { error } = await sb.from('json_versions').insert({
      project_id: projectId,
      app,
      version_number: version,
      file_path: filePath,
      json_content: jsonContent,
      uploaded_by: createdBy || null,
      is_final: false,
    });
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    console.warn('[fnp] json_versions insert failed:', e.message);
    return { ok: false, error: e.message };
  }
}

// ── 完成プール自動移動（クライアント起動時に1回呼ぶ）─
async function fnpAutoMoveCompletedPool() {
  const sb = fnpSb();
  if (!sb) return { moved: 0 };
  const today = new Date().toISOString().slice(0, 10);
  try {
    const { data, error } = await sb.from('project_master')
      .update({ status: 'completed_pool' })
      .eq('status', 'in_progress')
      .lt('planned_end_date', today)
      .select('project_id');
    if (error) throw error;
    return { moved: (data || []).length };
  } catch (e) {
    console.warn('[fnp] auto-move err:', e.message);
    return { moved: 0, error: e.message };
  }
}

window.fnpExtractAndParse = fnpExtractAndParse;
window.fnpInsertToDb = fnpInsertToDb;
window.fnpInsertJsonVersion = fnpInsertJsonVersion;
window.fnpAutoMoveCompletedPool = fnpAutoMoveCompletedPool;
