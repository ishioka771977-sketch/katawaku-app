// ============================================================
// 型知 API 共通（api/_lib/store.js）— 認証・DB記録・知見・AI呼び出しの共通部
// Vercel は api/ 配下の `_` 始まりを関数として公開しない（ここはライブラリ）
// ============================================================
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

const MODELS = { standard: 'claude-opus-5-5', precise: 'claude-fable-5-1' };

let _sb = null;
function sb() {
  if (_sb) return _sb;
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('サーバ設定不足（SUPABASE）');
  _sb = createClient(url, key, { auth: { persistSession: false } });
  return _sb;
}

let _anthropic = null;
function anthropic() {
  if (_anthropic) return _anthropic;
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('サーバ設定不足（ANTHROPIC_API_KEY）');
  _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

// ---------- 端末認証（登録端末のみ） ----------
async function verifyDevice(req) {
  const emp = String(req.headers['x-employee-number'] || '').trim().toUpperCase();
  const dev = String(req.headers['x-device-id'] || '').trim();
  if (!emp || !dev) return { ok: false, status: 401, error: 'ログインしてください（型知の登録端末のみ使えます）' };
  let q;
  try {
    q = await sb().from('user_devices').select('id')
      .eq('employee_number', emp).eq('app_id', 'katachi').eq('device_id', dev).eq('is_active', true).limit(1);
  } catch (e) { return { ok: false, status: 500, error: e.message }; }
  if (q.error) return { ok: false, status: 500, error: '端末確認に失敗: ' + q.error.message };
  if (!q.data || !q.data.length) return { ok: false, status: 403, error: 'この端末は型知に登録されていません。ログインし直してください' };
  return { ok: true, employee_number: emp };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

// ---------- 知識（Git管理・プロンプトキャッシュ） ----------
let _knowledge = null;
function loadKnowledge() {
  if (_knowledge) return _knowledge;
  const dir = path.join(process.cwd(), 'knowledge');
  const files = ['katachi_setup_v9.md', '05_slab_knowhow.md', '02_correct_procedure.md', '08_veteran_glossary.md'];
  _knowledge = files.map((f) => {
    try { return `\n\n===== ${f} =====\n` + fs.readFileSync(path.join(dir, f), 'utf8'); }
    catch (e) { return `\n\n===== ${f} (読込失敗: ${e.message}) =====`; }
  }).join('');
  return _knowledge;
}

// ---------- 知見（DB・対話から蓄積。次回のプロンプトに載る） ----------
// テーブル未作成でも落とさない（空で返す）
async function loadLessons(structureType, limit = 60) {
  try {
    const { data, error } = await sb().from('katachi_lessons')
      .select('category, title, content, project_name, structure_type, created_at')
      .eq('status', 'active')
      .or(`structure_type.eq.${structureType},structure_type.is.null`)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return { text: '', count: 0, warning: error.message };
    if (!data || !data.length) return { text: '', count: 0 };
    const text = data.map((l) => `- [${l.category}] ${l.title}（${l.project_name || '現場不明'}）: ${l.content}`).join('\n');
    return { text: `\n\n===== 過去の現場で代理人との対話から得た知見（新しい順・必ず参照） =====\n${text}`, count: data.length };
  } catch (e) { return { text: '', count: 0, warning: e.message }; }
}

// ---------- セッション記録（テーブル未作成なら warning を返して続行） ----------
async function createSession(fields) {
  try {
    const { data, error } = await sb().from('katachi_sessions').insert(fields).select('id').single();
    if (error) return { id: null, warning: '記録できませんでした: ' + error.message };
    return { id: data.id };
  } catch (e) { return { id: null, warning: e.message }; }
}

async function getSession(id) {
  const { data, error } = await sb().from('katachi_sessions').select('*').eq('id', id).single();
  if (error) throw new Error('セッションが見つかりません: ' + error.message);
  return data;
}

async function updateSession(id, fields) {
  const { error } = await sb().from('katachi_sessions').update(fields).eq('id', id);
  if (error) throw new Error('セッション更新に失敗: ' + error.message);
}

async function listSessions({ employee_number, limit = 30 } = {}) {
  let q = sb().from('katachi_sessions')
    .select('id, project_name, structure_type, structure_name, employee_number, status, mode, round_count, created_at, updated_at')
    .order('updated_at', { ascending: false }).limit(limit);
  if (employee_number) q = q.eq('employee_number', employee_number);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

async function getDialogue(sessionId) {
  const { data, error } = await sb().from('katachi_dialogue').select('*').eq('session_id', sessionId).order('seq');
  if (error) throw new Error(error.message);
  return data || [];
}

// rows: [{role, kind, content, field?, old_value?, new_value?, ref_seq?}]
async function appendDialogue(sessionId, rows, createdBy) {
  if (!sessionId || !rows.length) return { nextSeq: null };
  const { data: last } = await sb().from('katachi_dialogue').select('seq').eq('session_id', sessionId).order('seq', { ascending: false }).limit(1);
  let seq = (last && last.length ? last[0].seq : 0);
  const out = rows.map((r) => ({ session_id: sessionId, seq: ++seq, created_by: createdBy, ...r }));
  const { error } = await sb().from('katachi_dialogue').insert(out);
  if (error) throw new Error('対話の記録に失敗: ' + error.message);
  return { nextSeq: seq + 1, rows: out };
}

async function addLessons(sessionId, meta, lessons, createdBy) {
  if (!lessons || !lessons.length) return 0;
  const rows = lessons.filter((l) => l && l.title && l.content).map((l) => ({
    session_id: sessionId, project_name: meta.project_name, structure_type: l.applies_to_all ? null : meta.structure_type,
    category: l.category || '知見', title: l.title, content: l.content, source: l.source || '代理人との対話', created_by: createdBy,
  }));
  if (!rows.length) return 0;
  const { error } = await sb().from('katachi_lessons').insert(rows);
  if (error) throw new Error('知見の記録に失敗: ' + error.message);
  return rows.length;
}

module.exports = { MODELS, sb, anthropic, verifyDevice, readJsonBody, loadKnowledge, loadLessons, createSession, getSession, updateSession, listSessions, getDialogue, appendDialogue, addLessons };
