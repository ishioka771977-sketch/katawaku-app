// ============================================================
// 型知 v3.4 — セットアップmd取得 / 棚卸し / md更新
//   仕様書: 2026-04-27 v3.4 第4章・第5章
// ============================================================

const SMD_TABLE = 'setup_md_versions';
const SMD_LOCAL_KEY_LAST_FETCHED = 'katachi_setup_md_last_fetched';

function smdSb() { return window.getSb ? window.getSb() : null; }

// ── 最新版取得 ────────────────────────────────────
async function smdGetLatest(app = 'katachi') {
  const sb = smdSb(); if (!sb) return null;
  const { data, error } = await sb.from(SMD_TABLE)
    .select('*')
    .eq('app', app)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) { console.error('[smd] get err', error); return null; }
  return data;
}

// ── 取得ボタン処理（クリップボードコピー）────────
async function smdFetchToClipboard(app = 'katachi') {
  const latest = await smdGetLatest(app);
  if (!latest) {
    return { ok: false, error: 'まだセットアップmdが登録されていません' };
  }
  await navigator.clipboard.writeText(latest.md_content);
  // 最終取得日を記録
  localStorage.setItem(SMD_LOCAL_KEY_LAST_FETCHED + '_' + app, new Date().toISOString());
  return { ok: true, version: latest.version_number, length: latest.md_content.length, summary: latest.change_summary };
}

// ── NEWバッジ判定 ──────────────────────────────────
async function smdGetBadgeInfo(app = 'katachi') {
  const latest = await smdGetLatest(app);
  if (!latest) return { hasNew: false, latestUpdatedAt: null, lastFetchedAt: null, summary: null, version: 0 };
  const lastFetched = localStorage.getItem(SMD_LOCAL_KEY_LAST_FETCHED + '_' + app);
  const hasNew = !lastFetched || (new Date(latest.created_at) > new Date(lastFetched));
  return {
    hasNew,
    latestUpdatedAt: latest.created_at,
    lastFetchedAt: lastFetched,
    summary: latest.change_summary,
    version: latest.version_number,
  };
}

// ── アプリ起動時のヘッダー初期化 ────────────────────
async function smdRenderBadge(buttonId, hintId, app = 'katachi') {
  const info = await smdGetBadgeInfo(app);
  const btn = document.getElementById(buttonId);
  const hint = document.getElementById(hintId);
  if (!btn) return;

  // ボタンに NEW バッジを付ける
  btn.innerHTML = info.hasNew
    ? `📋 セットアップmd取得 <span style="background:#e74c3c;color:#fff;font-size:9px;padding:1px 5px;border-radius:8px;margin-left:4px">NEW</span>`
    : `📋 セットアップmd取得`;

  if (hint) {
    if (info.version === 0) {
      hint.innerHTML = `<span style="color:#999">まだ登録されていません</span>`;
    } else {
      const updated = info.latestUpdatedAt ? new Date(info.latestUpdatedAt).toLocaleDateString('ja-JP') : '-';
      const fetched = info.lastFetchedAt ? new Date(info.lastFetchedAt).toLocaleDateString('ja-JP') : '未取得';
      hint.innerHTML = `<span style="color:#666">v${info.version}（最終更新 ${updated}） / 前回取得 ${fetched}</span>`
        + (info.hasNew && info.summary
          ? `<details style="margin-top:4px"><summary style="cursor:pointer;color:#1a5276;font-size:11px">▼ 今回の更新内容</summary><div style="background:#f8f9fa;padding:6px 10px;margin-top:4px;border-left:3px solid #1a5276;font-size:11px;white-space:pre-wrap">${escHtmlSimple(info.summary)}</div></details>`
          : '');
    }
  }
}

function escHtmlSimple(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// ── セットアップmd更新 (admin) ────────────────────
async function smdUploadNewVersion({ app, mdContent, changeSummary, integratedProjectIds }) {
  const sb = smdSb(); if (!sb) throw new Error('Supabase 未接続');
  // 次バージョン番号
  const { data: existing } = await sb.from(SMD_TABLE)
    .select('version_number')
    .eq('app', app)
    .order('version_number', { ascending: false })
    .limit(1);
  const nextV = ((existing && existing[0]?.version_number) || 0) + 1;

  const auth = window.__ishiokaAuth?.profile;
  const { data, error } = await sb.from(SMD_TABLE).insert({
    app,
    version_number: nextV,
    md_content: mdContent,
    change_summary: changeSummary || null,
    integrated_project_ids: integratedProjectIds || [],
    created_by: auth?.employee_number || 'hide',
  }).select().single();
  if (error) throw error;

  // 統合対象工事の status を 'integrated' に
  if (integratedProjectIds && integratedProjectIds.length > 0) {
    const today = new Date().toISOString().slice(0, 10);
    await sb.from('project_master').update({
      status: 'integrated',
      actual_end_date: today,
    }).in('project_id', integratedProjectIds);
  }
  return data;
}

// ── 棚卸し用エクスポート ─────────────────────────
async function smdBuildInventoryExport(opts = {}) {
  const sb = smdSb(); if (!sb) return null;
  // completed_pool の工事を取得（または全件、または指定IDs）
  let q = sb.from('project_master').select('*');
  if (opts.projectIds && opts.projectIds.length > 0) {
    q = q.in('project_id', opts.projectIds);
  } else {
    q = q.eq('status', 'completed_pool');
  }
  const { data: projects, error } = await q;
  if (error) { console.error('[smd] inventory err', error); return null; }
  if (!projects || projects.length === 0) return '# 石岡組 棚卸しデータ\n\n対象の完成プール工事はありません。\n';

  const today = new Date().toISOString().slice(0, 10);
  let md = `# 石岡組 棚卸しデータ ${today}出力\n\n`;
  md += `## 完成プール工事一覧（${projects.length}件）\n\n`;

  for (const p of projects) {
    md += `### 工事: ${p.project_name} (\`${p.project_id}\`)\n\n`;
    md += `- 工期: ${p.start_date || '-'} 〜 ${p.planned_end_date || '-'}\n`;
    md += `- 場所: ${p.location || '-'}\n`;
    md += `- 施工者: ${p.contractor || '-'}\n\n`;

    // 最新版 JSON を取得
    for (const app of ['katachi', 'tetchi']) {
      const { data: jvs } = await sb.from('json_versions')
        .select('*')
        .eq('project_id', p.project_id)
        .eq('app', app)
        .order('version_number', { ascending: false })
        .limit(1);
      if (jvs && jvs[0]) {
        md += `#### 最終版JSON（${app}）v${jvs[0].version_number}\n\n`;
        md += '```json\n' + JSON.stringify(jvs[0].json_content, null, 2) + '\n```\n\n';
      }
    }

    // 関連する知見サマリー
    const { data: notes } = await sb.from('field_notes')
      .select('category, title, content, app, source, created_at')
      .eq('project_id', p.project_id)
      .order('created_at', { ascending: true });
    if (notes && notes.length > 0) {
      md += `#### 関連する知見サマリー（${notes.length}件）\n\n`;
      for (const n of notes) {
        md += `- **[${n.category}] ${n.title}** (${n.app})\n  ${n.content.replace(/\n/g, '\n  ')}\n  ${n.source ? `(出典: ${n.source})` : ''}\n\n`;
      }
    }
    md += `\n---\n\n`;
  }
  return md;
}

window.smdGetLatest = smdGetLatest;
window.smdFetchToClipboard = smdFetchToClipboard;
window.smdGetBadgeInfo = smdGetBadgeInfo;
window.smdRenderBadge = smdRenderBadge;
window.smdUploadNewVersion = smdUploadNewVersion;
window.smdBuildInventoryExport = smdBuildInventoryExport;
