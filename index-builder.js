// ============================================================
// 型知 v2.0 — INDEX.md 自動生成ロジック
//   仕様書: 2026-04-27 v2.0 第6章
//
// 提供する関数:
//   - ibRebuildAllIndexes(): トップINDEX + projects/INDEX + field_notes/INDEX を全て再生成
// ============================================================

const IB_BUCKET = 'knowledge-base';

function ibSb() { return window.getSb ? window.getSb() : null; }

// 新形式ファイル名のパース
//   <project_id>__<app>__v<N>.<ext>
function ibParseFilename(name) {
  const m = name.match(/^(.+?)__([a-z]+)__v(\d+)\.(json|md)$/);
  if (!m) return null;
  return { projectId: m[1], app: m[2], version: parseInt(m[3], 10), ext: m[4] };
}

// 旧形式ファイル名のパース
//   {YYYY-MM-DD}_p_xxxxx_<struct>.json|.md
function ibParseLegacyFilename(name) {
  if (!/^\d{4}-\d{2}-\d{2}_/.test(name)) return null;
  const m = name.match(/^(\d{4}-\d{2}-\d{2})_(p_[a-z0-9]+)_(.+?)\.(json|md)$/i);
  if (!m) return null;
  return { date: m[1], projSlug: m[2], rest: m[3], ext: m[4], legacy: true };
}

function ibFmtTime(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  } catch { return ts; }
}

function ibFmtSize(b) {
  const n = parseInt(b, 10) || 0;
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(2)}MB`;
}

// projects / field_notes 配下の全ファイルをカテゴリ分類
async function ibCategorizeFiles(dir) {
  const sb = ibSb(); if (!sb) return { newFmt: [], legacy: [], total: 0 };
  const { data } = await sb.storage.from(IB_BUCKET).list(dir, { limit: 1000 });
  const files = (data || []).filter(f => f.name && !f.name.startsWith('.') && f.name !== 'INDEX.md');
  const newFmt = [];
  const legacy = [];
  for (const f of files) {
    if (f.name === '_backup' || f.id === null) continue; // ディレクトリスキップ
    const np = ibParseFilename(f.name);
    if (np) {
      newFmt.push({ ...f, parsed: np });
      continue;
    }
    const lp = ibParseLegacyFilename(f.name);
    if (lp) {
      legacy.push({ ...f, parsed: lp });
    }
  }
  return { newFmt, legacy, total: files.length };
}

// projects/INDEX.md を生成
async function ibBuildProjectsIndex() {
  const { newFmt, legacy } = await ibCategorizeFiles('projects');
  const now = ibFmtTime(new Date().toISOString());
  let md = `# projects/ INDEX\n\n最終更新: ${now}\n\n`;

  md += `## 新形式 (${newFmt.length}件)\n\n`;
  if (newFmt.length === 0) {
    md += `（まだファイルがありません）\n\n`;
  } else {
    md += `| ファイル | project_id | アプリ | バージョン | サイズ | 更新日時 |\n`;
    md += `|---|---|---|---|---|---|\n`;
    const sorted = [...newFmt].sort((a, b) =>
      (a.parsed.projectId + a.parsed.app).localeCompare(b.parsed.projectId + b.parsed.app)
      || (a.parsed.version - b.parsed.version)
    );
    for (const f of sorted) {
      const sz = ibFmtSize(f.metadata?.size || 0);
      const upd = ibFmtTime(f.updated_at || f.created_at);
      md += `| ${f.name} | ${f.parsed.projectId} | ${f.parsed.app} | v${f.parsed.version} | ${sz} | ${upd} |\n`;
    }
    md += `\n`;
  }

  if (legacy.length > 0) {
    md += `## 旧形式 (${legacy.length}件)\n\n`;
    md += `| ファイル | 推定project_id |\n|---|---|\n`;
    for (const f of legacy) {
      md += `| ${f.name} | (未マッピング) |\n`;
    }
    md += `\n`;
  }
  return md;
}

// field_notes/INDEX.md を生成
async function ibBuildFieldNotesIndex() {
  const { newFmt, legacy } = await ibCategorizeFiles('field_notes');
  const now = ibFmtTime(new Date().toISOString());
  let md = `# field_notes/ INDEX\n\n最終更新: ${now}\n\n`;

  md += `## 新形式 (${newFmt.length}件)\n\n`;
  if (newFmt.length === 0) {
    md += `（まだフィールドノートがありません）\n\n`;
  } else {
    md += `| ファイル | project_id | アプリ | バージョン | サイズ | 更新日時 |\n`;
    md += `|---|---|---|---|---|---|\n`;
    const sorted = [...newFmt].sort((a, b) =>
      (b.updated_at || '').localeCompare(a.updated_at || '')
    );
    for (const f of sorted) {
      const sz = ibFmtSize(f.metadata?.size || 0);
      const upd = ibFmtTime(f.updated_at || f.created_at);
      md += `| ${f.name} | ${f.parsed.projectId} | ${f.parsed.app} | v${f.parsed.version} | ${sz} | ${upd} |\n`;
    }
    md += `\n`;
  }

  if (legacy.length > 0) {
    md += `## 旧形式 (${legacy.length}件)\n\n`;
    md += `| ファイル | 推定project_id |\n|---|---|\n`;
    for (const f of legacy) {
      md += `| ${f.name} | (未マッピング) |\n`;
    }
    md += `\n`;
  }
  return md;
}

// トップ INDEX.md を生成
async function ibBuildTopIndex() {
  const sb = ibSb(); if (!sb) return '# 石岡組 工事ナレッジベース INDEX\n\nSupabase 未接続\n';

  // project_master 全件取得
  const { data: projects } = await sb.from('project_master').select('*');
  const all = projects || [];

  // ファイル件数集計
  const projFiles = await ibCategorizeFiles('projects');
  const noteFiles = await ibCategorizeFiles('field_notes');

  // project_id ごとの件数を集計
  const counts = {};  // {projectId: {katachi: {json:N, md:N}, tetchi: {json:N, md:N}}}
  function bump(pid, app, ext) {
    if (!counts[pid]) counts[pid] = {};
    if (!counts[pid][app]) counts[pid][app] = { json: 0, md: 0 };
    counts[pid][app][ext]++;
  }
  for (const f of projFiles.newFmt) bump(f.parsed.projectId, f.parsed.app, f.parsed.ext);
  for (const f of noteFiles.newFmt) bump(f.parsed.projectId, f.parsed.app, f.parsed.ext);

  const inProgress = all.filter(p => p.status === 'in_progress');
  const completed = all.filter(p => p.status === 'completed_pool');
  const integrated = all.filter(p => p.status === 'integrated');

  const now = ibFmtTime(new Date().toISOString());
  let md = `# 石岡組 工事ナレッジベース INDEX\n\n最終更新: ${now}\n\n`;

  // 進行中
  md += `## 進行中の工事 (${inProgress.length}件)\n\n`;
  if (inProgress.length === 0) {
    md += `（進行中の工事はまだありません）\n\n`;
  } else {
    md += `| project_id | 工事名 | 工期 | 型知ファイル数 | 鉄知ファイル数 | 知見ノート |\n`;
    md += `|---|---|---|---:|---:|---:|\n`;
    for (const p of inProgress) {
      const c = counts[p.project_id] || {};
      const kCount = (c.katachi?.json || 0);
      const tCount = (c.tetchi?.json || 0);
      const noteCount = (c.katachi?.md || 0) + (c.tetchi?.md || 0);
      const start = p.start_date || '-';
      const end = p.planned_end_date || '-';
      md += `| ${p.project_id} | ${p.project_name} | ${start} 〜 ${end} | ${kCount} | ${tCount} | ${noteCount} |\n`;
    }
    md += `\n`;
  }

  // 完成プール
  if (completed.length > 0) {
    md += `## 完成プールの工事 (${completed.length}件)\n\n`;
    md += `| project_id | 工事名 | 完了日 |\n|---|---|---|\n`;
    for (const p of completed) {
      md += `| ${p.project_id} | ${p.project_name} | ${p.actual_end_date || '-'} |\n`;
    }
    md += `\n`;
  }

  // 統合済み
  if (integrated.length > 0) {
    md += `## 統合済みの工事 (${integrated.length}件)\n\n`;
    for (const p of integrated) {
      md += `- ${p.project_id} — ${p.project_name}\n`;
    }
    md += `\n`;
  }

  // 旧形式（実データ0想定だが、出現したら表示）
  const legacyTotal = projFiles.legacy.length + noteFiles.legacy.length;
  if (legacyTotal > 0) {
    md += `## 旧形式ファイル (${legacyTotal}件)\n\n`;
    md += `projects/: ${projFiles.legacy.length}件、field_notes/: ${noteFiles.legacy.length}件\n\n`;
    md += `→ 詳細は \`projects/INDEX.md\` および \`field_notes/INDEX.md\` を参照してください。\n\n`;
  }

  md += `---\n\n`;
  md += `## 統計サマリ\n\n`;
  md += `- 工事数: ${all.length}件 (進行中 ${inProgress.length} / 完成プール ${completed.length} / 統合済み ${integrated.length})\n`;
  md += `- projects/ ファイル数: ${projFiles.total} (新形式 ${projFiles.newFmt.length} / 旧形式 ${projFiles.legacy.length})\n`;
  md += `- field_notes/ ファイル数: ${noteFiles.total} (新形式 ${noteFiles.newFmt.length} / 旧形式 ${noteFiles.legacy.length})\n`;

  return md;
}

// すべてのINDEXを再生成して Storage に upsert
async function ibRebuildAllIndexes() {
  const sb = ibSb(); if (!sb) return { ok: false, error: 'no-sb' };
  try {
    const [topMd, projMd, noteMd] = await Promise.all([
      ibBuildTopIndex(),
      ibBuildProjectsIndex(),
      ibBuildFieldNotesIndex(),
    ]);

    const upserts = [
      { path: 'INDEX.md', content: topMd },
      { path: 'projects/INDEX.md', content: projMd },
      { path: 'field_notes/INDEX.md', content: noteMd },
    ];

    for (const u of upserts) {
      const blob = new Blob([u.content], { type: 'text/markdown; charset=utf-8' });
      const { error } = await sb.storage.from(IB_BUCKET).upload(u.path, blob, {
        upsert: true,
        contentType: 'text/markdown; charset=utf-8',
      });
      if (error) console.warn('[ib] upload err', u.path, error.message);
    }
    return { ok: true, paths: upserts.map(u => u.path) };
  } catch (e) {
    console.error('[ib] rebuild err', e);
    return { ok: false, error: e.message };
  }
}

window.ibRebuildAllIndexes = ibRebuildAllIndexes;
window.ibBuildTopIndex = ibBuildTopIndex;
window.ibBuildProjectsIndex = ibBuildProjectsIndex;
window.ibBuildFieldNotesIndex = ibBuildFieldNotesIndex;
