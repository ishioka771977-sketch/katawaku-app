// ============================================================
// 型知／鉄知 共通 — 工事一覧と設計書の保管（api/_lib/docs.js）
// ============================================================
// 工事一覧: KYナビ・日報ナビと共有の projects 表（is_internal=false）
// 設計書  : Supabase Storage の private バケット design-docs に <project_id>/<ファイル名>.pdf で保管。
//           一度誰かが登録すれば、次から現場代理人は「工事を選ぶ」だけで同じ設計書を使える。
//           表は増やさない（Storage の一覧が正）。読み書きは service_role・署名付きURLで行う。
// FileForce: Drive マウント／公式API は不可（仕様書非公開・2026-09-25/26 検証）。代わりに
//            ブックマークレット（/ff-import.js）が FileForce Web の画面用APIでPDFを取り、
//            型知の小窓（/ff-bridge.html・端末認証）経由でここへ登録する。人の操作は「フォルダを開いて1クリック」。
// ============================================================
const { sb } = require('./store');

const BUCKET = 'design-docs';
const SIGN_TTL = 60 * 60; // 1時間

function fiscalYearOf(dateStr) {
  const d = new Date(dateStr);
  const y = d.getFullYear(), m = d.getMonth() + 1;
  return m >= 4 ? y : y - 1; // 4月始まり
}

async function listProjects() {
  const { data, error } = await sb().from('projects')
    .select('id, project_name, is_internal, created_at')
    .eq('is_internal', false)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error('工事一覧の取得に失敗: ' + error.message);
  const rows = (data || []).filter((p) => !/検証用|e2e/i.test(p.project_name || ''));
  // 設計書の登録数（プロジェクトごとの prefix を一覧）
  const counts = new Map();
  try {
    const { data: dirs } = await sb().storage.from(BUCKET).list('', { limit: 500 });
    for (const d of dirs || []) {
      if (!d.id && d.name) {
        const { data: files } = await sb().storage.from(BUCKET).list(d.name, { limit: 100 });
        const pdfs = (files || []).filter((f) => /\.pdf$/i.test(f.name));
        counts.set(d.name, { count: pdfs.length, updated_at: pdfs.reduce((a, f) => (f.updated_at > a ? f.updated_at : a), '') });
      }
    }
  } catch (e) { /* 一覧が取れなくても工事一覧は返す */ }
  return rows.map((p) => ({
    id: p.id, project_name: p.project_name, created_at: p.created_at, fiscal_year: fiscalYearOf(p.created_at),
    docs: counts.get(String(p.id)) || { count: 0, updated_at: '' },
  }));
}

async function listDocs(projectId) {
  const { data, error } = await sb().storage.from(BUCKET).list(String(projectId), { limit: 100, sortBy: { column: 'name', order: 'asc' } });
  if (error) throw new Error('設計書一覧の取得に失敗: ' + error.message);
  const files = (data || []).filter((f) => /\.pdf$/i.test(f.name));
  const out = [];
  for (const f of files) {
    const path = `${projectId}/${f.name}`;
    const { data: s, error: se } = await sb().storage.from(BUCKET).createSignedUrl(path, SIGN_TTL);
    out.push({ name: f.name, path, size: f.metadata?.size ?? null, updated_at: f.updated_at, url: se ? null : s.signedUrl });
  }
  // FileForce のフォルダURL（登録者が残したメモ）
  let fileforce_url = null;
  try {
    const { data: meta } = await sb().storage.from(BUCKET).download(`${projectId}/_meta.json`);
    if (meta) fileforce_url = JSON.parse(await meta.text()).fileforce_url || null;
  } catch { /* なし */ }
  return { files: out, fileforce_url };
}

async function signedUpload(projectId, filename) {
  const safe = String(filename).replace(/[\\/]/g, '_');
  const path = `${projectId}/${safe}`;
  // 既存があれば上書き（署名付きアップロードは upsert 不可のため先に消す）
  await sb().storage.from(BUCKET).remove([path]).catch(() => {});
  const { data, error } = await sb().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) throw new Error('アップロードURLの発行に失敗: ' + error.message);
  return { path, token: data.token, signedUrl: data.signedUrl };
}

async function saveMeta(projectId, meta) {
  const blob = Buffer.from(JSON.stringify(meta), 'utf8');
  const { error } = await sb().storage.from(BUCKET).upload(`${projectId}/_meta.json`, blob, { contentType: 'application/json', upsert: true });
  if (error) throw new Error('メモの保存に失敗: ' + error.message);
}

async function removeDoc(projectId, name) {
  const { error } = await sb().storage.from(BUCKET).remove([`${projectId}/${String(name).replace(/[\\/]/g, '_')}`]);
  if (error) throw new Error('削除に失敗: ' + error.message);
}

module.exports = { BUCKET, listProjects, listDocs, signedUpload, saveMeta, removeDoc };
