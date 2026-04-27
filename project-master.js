// ============================================================
// 型知 v2.0 — project_master 連携 / project_id 生成 / ファイル名規約
//   仕様書: 2026-04-27 v2.0 指令書
//
// 提供する関数:
//   - pmListProjects(): プロジェクト一覧取得（プルダウン候補用）
//   - pmGetProject(projectId): 単一取得
//   - pmInsertProject(data): 工事登録
//   - pmGenerateProjectId(name, structFamily): 自動候補生成（編集可）
//   - pmFilenameFor({projectId, app, version, ext}): 新形式ファイル名
//   - pmListVersions(projectId, app): 既存バージョン一覧
//   - pmDecideNextVersion(projectId, app): 次バージョン番号
// ============================================================

const PM_BUCKET = 'knowledge-base';
const PM_TABLE = 'project_master';

// ── 構造系統 → slug マッピング ────────────────────────
// 型知: _rebar なし / 鉄知: _rebar あり / 補修等: 自由スラッグ
const PM_STRUCT_FAMILY = {
  // 型知系（型枠）
  slab:        { label: '床版（型枠）',           app: 'katachi' },
  parapet:     { label: '地覆・壁高欄（型枠）',   app: 'katachi' },
  wall:        { label: '擁壁（型枠）',           app: 'katachi' },
  abutment:    { label: '橋台（型枠）',           app: 'katachi' },
  pier:        { label: '橋脚（型枠）',           app: 'katachi' },
  box:         { label: 'BOXカルバート（型枠）',  app: 'katachi' },
  foundation:  { label: '基礎（型枠）',           app: 'katachi' },
  // 鉄知系（鉄筋） — UI上の参考
  slab_rebar:        { label: '床版（鉄筋）',          app: 'tetchi' },
  parapet_rebar:     { label: '地覆・壁高欄（鉄筋）',  app: 'tetchi' },
  wall_rebar:        { label: '擁壁（鉄筋）',          app: 'tetchi' },
  abutment_rebar:    { label: '橋台（鉄筋）',          app: 'tetchi' },
  pier_rebar:        { label: '橋脚（鉄筋）',          app: 'tetchi' },
  box_rebar:         { label: 'BOXカルバート（鉄筋）', app: 'tetchi' },
  foundation_rebar:  { label: '基礎（鉄筋）',          app: 'tetchi' },
  // 補修・その他
  repair:      { label: '補修工事',               app: 'common' },
  other:       { label: 'その他',                 app: 'common' },
};

// 型知側の構造種別（JSON取り込み時のenum）→ 構造系統slug
const PM_KATACHI_STRUCT_TO_FAMILY = {
  deck_slab: 'slab',
  parapet: 'parapet',
  parapet_curb_and_barrier: 'parapet',
  retaining_wall: 'wall',
  abutment: 'abutment',
  pier: 'pier',
  box_culvert: 'box',
  foundation: 'foundation',
};

// ── 簡易ローマ字変換辞書 ──────────────────────────────
// 完璧を目指さない（くろたん指示）。辞書になければそのまま英数字化
const PM_ROMAJI_DICT = {
  // 橋名・地名
  '宿野辺': 'shukunobe', '宿野辺橋': 'shukunobebashi',
  '塩釜': 'shiogama',
  '千歳': 'chitose',
  '函館': 'hakodate',
  '札幌': 'sapporo',
  '小樽': 'otaru',
  '福島': 'fukushima',
  '松前': 'matsumae',
  '青森': 'aomori',
  '盛岡': 'morioka',
  // 構造物・工種
  '橋': 'bashi', '床版': 'shoban', '地覆': 'chifuku',
  '壁高欄': 'kabekoran', '擁壁': 'youheki', '橋台': 'kyodai',
  '橋脚': 'kyokyaku', '基礎': 'kiso',
  'トンネル': 'tunnel', '補修': 'hoshu',
  '工事': '', '改良': 'kairyo', '新設': 'shinsetsu',
  '道路': 'doro', '災害': 'saigai', '復旧': 'fukkyu',
};

function pmRomanize(text) {
  if (!text) return 'project';
  let result = String(text);
  // 辞書順（長い順）で置換
  const keys = Object.keys(PM_ROMAJI_DICT).sort((a,b) => b.length - a.length);
  for (const k of keys) {
    result = result.split(k).join(PM_ROMAJI_DICT[k] ? '_' + PM_ROMAJI_DICT[k] : '');
  }
  // 英数字以外を除去 + 連続アンダースコア圧縮
  result = result.replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return result.toLowerCase() || 'project';
}

// ── project_id 生成（自動候補） ───────────────────────
// 形式: prj_<YYYY>_<ローマ字工事名>_<構造系統slug>
function pmGenerateProjectId(projectName, structFamilySlug) {
  const year = new Date().getFullYear();
  const nameRoma = pmRomanize(projectName);
  const family = (structFamilySlug || 'project').replace(/[^a-zA-Z0-9_]/g, '');
  return `prj_${year}_${nameRoma}_${family}`;
}

// ── Supabase クライアント ─────────────────────────────
function pmSb() {
  return window.getSb ? window.getSb() : null;
}

// ── CRUD ─────────────────────────────────────────────
async function pmListProjects(opts = {}) {
  const sb = pmSb(); if (!sb) return [];
  let q = sb.from(PM_TABLE).select('*').order('created_at', { ascending: false });
  if (opts.status) q = q.eq('status', opts.status);
  const { data, error } = await q;
  if (error) { console.error('[pm] list err', error); return []; }
  return data || [];
}

async function pmGetProject(projectId) {
  const sb = pmSb(); if (!sb) return null;
  const { data, error } = await sb.from(PM_TABLE).select('*').eq('project_id', projectId).maybeSingle();
  if (error) { console.error('[pm] get err', error); return null; }
  return data;
}

// 衝突回避: 既存と同 project_id があれば _2 _3 を付ける
async function pmEnsureUniqueProjectId(baseId) {
  const sb = pmSb(); if (!sb) return baseId;
  const { data } = await sb.from(PM_TABLE).select('project_id').like('project_id', `${baseId}%`);
  const exists = new Set((data || []).map(d => d.project_id));
  if (!exists.has(baseId)) return baseId;
  for (let i = 2; i < 100; i++) {
    const cand = `${baseId}_${i}`;
    if (!exists.has(cand)) return cand;
  }
  return `${baseId}_${Date.now().toString(36)}`;
}

async function pmInsertProject(record) {
  const sb = pmSb(); if (!sb) throw new Error('Supabase 未接続');
  const auth = window.__ishiokaAuth?.profile;
  const payload = {
    project_id: record.project_id,
    project_name: record.project_name,
    location: record.location || null,
    contractor: record.contractor || null,
    start_date: record.start_date || null,
    planned_end_date: record.planned_end_date || null,
    status: 'in_progress',
    created_by: auth?.employee_number || 'anon',
  };
  const { data, error } = await sb.from(PM_TABLE).insert(payload).select().single();
  if (error) throw error;
  return data;
}

async function pmUpdateLegacySlugs(projectId, legacySlugs) {
  const sb = pmSb(); if (!sb) throw new Error('Supabase 未接続');
  const { error } = await sb.from(PM_TABLE)
    .update({ legacy_slugs: legacySlugs })
    .eq('project_id', projectId);
  if (error) throw error;
}

// ── ファイル名規約 ─────────────────────────────────────
// 新形式: <project_id>__<app>__v<N>.<ext>
function pmFilenameFor({ projectId, app, version, ext }) {
  return `${projectId}__${app}__v${version}.${ext}`;
}

// 既存バージョン一覧
async function pmListVersions(projectId, app) {
  const sb = pmSb(); if (!sb) return [];
  const prefix = `${projectId}__${app}__v`;
  // projects/ と field_notes/ を両方サーチ
  const versions = new Set();
  for (const dir of ['projects', 'field_notes']) {
    try {
      const { data } = await sb.storage.from(PM_BUCKET).list(dir, { limit: 1000 });
      for (const f of (data || [])) {
        if (f.name.startsWith(prefix)) {
          const m = f.name.match(/__v(\d+)\./);
          if (m) versions.add(parseInt(m[1], 10));
        }
      }
    } catch {}
  }
  return [...versions].sort((a,b) => a - b);
}

async function pmDecideNextVersion(projectId, app) {
  const versions = await pmListVersions(projectId, app);
  return versions.length === 0 ? 1 : Math.max(...versions) + 1;
}

// ── バックアップ機能 ──────────────────────────────────
// v>=2 の取り込み時、既存最新版を _backup/ に move
async function pmBackupExistingVersions(projectId, app, dirs = ['projects', 'field_notes']) {
  const sb = pmSb(); if (!sb) return { moved: 0 };
  const prefix = `${projectId}__${app}__v`;
  let moved = 0;
  for (const dir of dirs) {
    try {
      const { data } = await sb.storage.from(PM_BUCKET).list(dir, { limit: 1000 });
      for (const f of (data || [])) {
        if (!f.name.startsWith(prefix)) continue;
        const src = `${dir}/${f.name}`;
        const dst = `${dir}/_backup/${f.name}`;
        // download → upload to backup → remove original
        const { data: blob, error: dlErr } = await sb.storage.from(PM_BUCKET).download(src);
        if (dlErr || !blob) continue;
        const { error: upErr } = await sb.storage.from(PM_BUCKET).upload(dst, blob, { upsert: true });
        if (upErr) { console.warn('[pm] backup upload failed:', dst, upErr.message); continue; }
        await sb.storage.from(PM_BUCKET).remove([src]);
        moved++;
      }
    } catch (e) {
      console.warn('[pm] backup err', dir, e);
    }
  }
  return { moved };
}

// ── プロジェクトラベル整形 ────────────────────────────
function pmProjectLabel(p) {
  const pid = p.project_id;
  const name = p.project_name || '';
  const status = p.status === 'in_progress' ? '進行中'
    : p.status === 'completed_pool' ? '完成プール'
    : p.status === 'integrated' ? '統合済み' : p.status;
  return `${name} (${pid}) [${status}]`;
}

// グローバル公開
window.pmListProjects = pmListProjects;
window.pmGetProject = pmGetProject;
window.pmInsertProject = pmInsertProject;
window.pmEnsureUniqueProjectId = pmEnsureUniqueProjectId;
window.pmGenerateProjectId = pmGenerateProjectId;
window.pmRomanize = pmRomanize;
window.pmFilenameFor = pmFilenameFor;
window.pmListVersions = pmListVersions;
window.pmDecideNextVersion = pmDecideNextVersion;
window.pmBackupExistingVersions = pmBackupExistingVersions;
window.pmUpdateLegacySlugs = pmUpdateLegacySlugs;
window.pmProjectLabel = pmProjectLabel;
window.PM_STRUCT_FAMILY = PM_STRUCT_FAMILY;
window.PM_KATACHI_STRUCT_TO_FAMILY = PM_KATACHI_STRUCT_TO_FAMILY;
