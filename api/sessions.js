// ============================================================
// 型知 — セッション一覧／再開（api/sessions.js）
// GET /api/sessions            → 自分＋全員の最近のセッション一覧
// GET /api/sessions?id=<uuid>  → 1件（params_current, json_current, 対話記録）
// POST /api/sessions {id, json?, status?} → 型知に読み込んだJSONの保存／クローズ
// ============================================================
const S = require('./_lib/store');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const auth = await S.verifyDevice(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    const url = new URL(req.url, 'http://x');
    if (req.method === 'GET') {
      const id = url.searchParams.get('id');
      if (id) {
        const session = await S.getSession(id);
        const dialogue = await S.getDialogue(id);
        return res.status(200).json({ ok: true, session, dialogue });
      }
      // 記録テーブル未作成でも画面は壊さない（空一覧＋warning）
      try {
        const sessions = await S.listSessions({ limit: 40 });
        return res.status(200).json({ ok: true, sessions, me: auth.employee_number });
      } catch (e) {
        return res.status(200).json({ ok: true, sessions: [], me: auth.employee_number, warning: e.message });
      }
    }
    if (req.method === 'POST') {
      const body = await S.readJsonBody(req);
      if (!body.id) return res.status(400).json({ error: 'id がありません' });
      const fields = {};
      if (body.json) fields.json_current = body.json;
      if (body.params) fields.params_current = body.params;
      if (body.status === 'closed' || body.status === 'open') fields.status = body.status;
      await S.updateSession(body.id, fields);
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'GET/POST only' });
  } catch (e) {
    return res.status(500).json({ error: (e && e.message) || '失敗しました' });
  }
};
