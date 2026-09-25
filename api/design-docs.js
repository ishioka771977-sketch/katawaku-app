// ============================================================
// /api/design-docs — 工事ごとの設計書（Storage design-docs）
//   GET    ?project_id=            → 登録済みPDF一覧（1時間有効の署名URL）＋FileForceフォルダURL
//   POST   {project_id, filename}  → 署名付きアップロードURL（ブラウザから直接PUT。大きなPDFもOK）
//   POST   {project_id, meta:{fileforce_url}} → メモ保存
//   DELETE ?project_id=&name=      → 1件削除
// 登録端末のみ
// ============================================================
const S = require('./_lib/store');
const D = require('./_lib/docs');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const auth = await S.verifyDevice(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET') {
      const pid = url.searchParams.get('project_id');
      if (!pid) return res.status(400).json({ error: 'project_id がありません' });
      const r = await D.listDocs(pid);
      return res.status(200).json({ ok: true, ...r });
    }
    if (req.method === 'POST') {
      const body = await S.readJsonBody(req);
      if (!body.project_id) return res.status(400).json({ error: 'project_id がありません' });
      if (body.meta) { await D.saveMeta(body.project_id, { ...body.meta, saved_by: auth.employee_number, saved_at: new Date().toISOString() }); return res.status(200).json({ ok: true }); }
      if (!body.filename || !/\.pdf$/i.test(body.filename)) return res.status(400).json({ error: 'PDFファイル名が必要です' });
      const r = await D.signedUpload(body.project_id, body.filename);
      return res.status(200).json({ ok: true, ...r });
    }
    if (req.method === 'DELETE') {
      const pid = url.searchParams.get('project_id'), name = url.searchParams.get('name');
      if (!pid || !name) return res.status(400).json({ error: 'project_id と name が必要です' });
      await D.removeDoc(pid, name);
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'GET/POST/DELETE only' });
  } catch (e) {
    return res.status(500).json({ error: e.message || '失敗しました' });
  }
};
