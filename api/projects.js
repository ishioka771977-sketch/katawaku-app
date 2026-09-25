// ============================================================
// GET /api/projects — 工事一覧（KY/日報ナビと共有の projects）＋設計書の登録数
// 登録端末のみ
// ============================================================
const S = require('./_lib/store');
const D = require('./_lib/docs');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  const auth = await S.verifyDevice(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  try {
    const projects = await D.listProjects();
    return res.status(200).json({ ok: true, projects, me: auth.employee_number });
  } catch (e) {
    return res.status(500).json({ error: e.message || '工事一覧の取得に失敗しました' });
  }
};
