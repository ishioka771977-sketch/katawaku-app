// ============================================================
// 型知 KATACHI — 設計書抽出API (api/extract.js)  Vercel Serverless (Node)
// ============================================================
// 役割: 設計図書（テキスト＋ページ画像）から床版の構造パラメータをAIで読み取り、
//       lib/slab-generator.js で型知JSONを決定的に生成し、検算結果と一緒に返す。
//       AIは「数値を読む」だけ。割付・数量はコードが計算する。
//
// POST /api/extract
//   headers: x-employee-number, x-device-id（型知にログイン済みの登録端末のみ）
//   body: {
//     structure_type: 'deck_slab',           // v1は床版のみ
//     mode: 'standard' | 'precise',           // standard=Opus 5.5 / precise=Fable 5.1
//     text: '...',                            // pdf.jsで抽出した全文（任意・最大200k字）
//     images: ['<base64 jpeg>', ...],         // 一般図・床版図などのページ画像（最大12枚・合計≒3.7MB）
//     filenames: ['fig01.pdf', ...],
//     project_hint: '宿野辺橋 床版工事'        // 任意
//   }
//   → { params, evidence, questions, json, checks, model, usage }
//
// 環境変数（Vercel）: ANTHROPIC_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// ============================================================
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const SlabGenerator = require('../lib/slab-generator');

const MODELS = {
  standard: 'claude-opus-5-5',
  precise: 'claude-fable-5-1',
};
const MAX_IMAGES = 12;
const MAX_TOTAL_BASE64 = 5_000_000;
const MAX_TEXT = 200_000;

// ---------- 知識（Git管理・起動時に1回読む・プロンプトキャッシュに載せる） ----------
let _knowledge = null;
function loadKnowledge() {
  if (_knowledge) return _knowledge;
  const dir = path.join(process.cwd(), 'knowledge');
  const files = ['katachi_setup_v9.md', '05_slab_knowhow.md', '02_correct_procedure.md', '08_veteran_glossary.md'];
  const parts = [];
  for (const f of files) {
    try { parts.push(`\n\n===== ${f} =====\n` + fs.readFileSync(path.join(dir, f), 'utf8')); }
    catch (e) { parts.push(`\n\n===== ${f} (読込失敗: ${e.message}) =====`); }
  }
  _knowledge = parts.join('');
  return _knowledge;
}

// ---------- 抽出スキーマ（structured output） ----------
const SLAB_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['project_name', 'structure_name', 'subtype', 'width_mm', 'length_mm', 'thickness_mm',
    'girder_count', 'girder_spacing_mm', 'base_plate', 'skew_angle_deg', 'skew_direction',
    'haunch_depth_mm', 'haunch_width_mm', 'cover_top_mm', 'cover_bottom_mm',
    'evidence', 'questions', 'extra_notes', 'confidence'],
  properties: {
    project_name: { type: 'string', description: '工事名（設計書の表紙どおり）' },
    structure_name: { type: 'string', description: '構造物名（例: 宿野辺橋 床版）' },
    subtype: { type: 'string', enum: ['composite_steel_deck', 'rc_slab', 'pc_slab'], description: '合成床版（底鋼板あり）/ RC床版 / PC床版' },
    width_mm: { type: 'integer', description: '床版の全幅（地覆含む総幅員）mm' },
    length_mm: { type: 'integer', description: '床版の橋軸方向長さ（床版長・桁長ではなく床版の長さ）mm' },
    thickness_mm: { type: 'integer', description: '床版厚（コンクリート厚）mm' },
    girder_count: { type: 'integer', description: '主桁本数' },
    girder_spacing_mm: { type: 'integer', description: '主桁間隔mm（等間隔でない場合は代表値・extra_notesに実配列を記す）' },
    base_plate: {
      type: 'object', additionalProperties: false, required: ['exists', 'thickness_mm', 'material'],
      properties: {
        exists: { type: 'boolean', description: '底鋼板の有無（合成床版なら true）' },
        thickness_mm: { type: ['number', 'null'], description: '底鋼板厚mm' },
        material: { type: ['string', 'null'], description: '底鋼板材質（例: SM490YB）' },
      },
    },
    skew_angle_deg: { type: 'number', description: '斜角（支承線と橋軸のなす角）。直橋は90' },
    skew_direction: { type: 'string', enum: ['right', 'left', 'none'], description: '斜角の向き（直橋は none）' },
    haunch_depth_mm: { type: ['number', 'null'], description: 'ハンチ高mm（不明ならnull）' },
    haunch_width_mm: { type: ['number', 'null'], description: 'ハンチ幅mm（不明ならnull）' },
    cover_top_mm: { type: ['number', 'null'], description: '上面かぶりmm（不明ならnull）' },
    cover_bottom_mm: { type: ['number', 'null'], description: '下面かぶりmm（不明ならnull）' },
    evidence: {
      type: 'array', description: '各数値の根拠（どの図面・どの記載から読んだか）',
      items: {
        type: 'object', additionalProperties: false, required: ['field', 'value', 'source', 'confidence'],
        properties: {
          field: { type: 'string' }, value: { type: 'string' },
          source: { type: 'string', description: '例: fig01.pdf p14 床版図(1) 断面図の寸法線' },
          confidence: { type: 'number', description: '0〜1' },
        },
      },
    },
    questions: { type: 'array', items: { type: 'string' }, description: '設計書から読めず人に確認が必要な事項' },
    extra_notes: {
      type: 'array', description: '型枠計画に効く固有事項（拡幅・変断面・不等間隔主桁・打継ぎ指定など）',
      items: { type: 'object', additionalProperties: false, required: ['category', 'content'], properties: { category: { type: 'string' }, content: { type: 'string' } } },
    },
    confidence: { type: 'number', description: '全体の確信度 0〜1' },
  },
};

const SYSTEM_PROMPT = `あなたは石岡組の型枠工事計画の補佐AI「型知」の抽出エンジンです。
設計図書（一般図・床版図・数量総括表・特記仕様書）から、床版型枠の割付に必要な構造パラメータを読み取ります。

必ず守ること:
1. 図面に書かれている数値だけを使う。推測で埋めない。読めない項目は null にして questions に書く。
2. 各数値には evidence を付ける（どのファイルの何ページ、どの図・どの寸法線か）。
3. 幅員は「床版の総幅（地覆を含む外々）」。車道幅員や有効幅員と混同しない。迷ったら両方を evidence に書き、総幅を採用する。
4. 床版長は「床版コンクリートの橋軸方向長さ」。桁長・支間長・橋長と区別する。
5. 主桁本数はG-1〜G-nのラベルの数。間隔は断面図の寸法線から。不等間隔なら代表値＋extra_notesに実配列。
6. 底鋼板（SM490等の鋼板が床版下面に一体）があれば合成床版。RC床版なら base_plate.exists=false。
7. 斜角は平面図の支承線と橋軸のなす角。直橋（90°）なら skew_angle_deg=90、skew_direction=null。
8. 単位はすべて mm。図面が m 表記なら換算する。
9. 割付・数量は計算しない（コードが計算する）。パラメータの読み取りに集中する。

以下は型知の知識ベース（JSON仕様と現場知見）。パラメータの意味を確認するために参照すること。`;

// ---------- 端末認証（登録端末のみAPIを使える） ----------
async function verifyDevice(req) {
  const emp = String(req.headers['x-employee-number'] || '').trim().toUpperCase();
  const dev = String(req.headers['x-device-id'] || '').trim();
  if (!emp || !dev) return { ok: false, status: 401, error: 'ログインしてください（型知の登録端末のみ使えます）' };
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { ok: false, status: 500, error: 'サーバ設定不足（SUPABASE）' };
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb
    .from('user_devices')
    .select('id')
    .eq('employee_number', emp)
    .eq('app_id', 'katachi')
    .eq('device_id', dev)
    .eq('is_active', true)
    .limit(1);
  if (error) return { ok: false, status: 500, error: '端末確認に失敗: ' + error.message };
  if (!data || !data.length) return { ok: false, status: 403, error: 'この端末は型知に登録されていません。ログインし直してください' };
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

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const auth = await verifyDevice(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    const body = await readJsonBody(req);
    const structureType = body.structure_type || 'deck_slab';
    if (structureType !== 'deck_slab') return res.status(400).json({ error: `未対応の構造物: ${structureType}（v1は床版のみ）` });
    const mode = body.mode === 'precise' ? 'precise' : 'standard';
    const model = MODELS[mode];

    const text = typeof body.text === 'string' ? body.text.slice(0, MAX_TEXT) : '';
    const images = Array.isArray(body.images) ? body.images.filter((s) => typeof s === 'string' && s) : [];
    if (images.length > MAX_IMAGES) return res.status(400).json({ error: `ページ画像が多すぎます（最大${MAX_IMAGES}枚）` });
    const total = images.reduce((a, s) => a + s.length, 0);
    if (total > MAX_TOTAL_BASE64) return res.status(400).json({ error: '画像データが大きすぎます（ページ数を減らすか解像度を下げてください）' });
    if (!text && !images.length) return res.status(400).json({ error: '設計書のテキストかページ画像が必要です' });

    if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'サーバ設定不足（ANTHROPIC_API_KEY）' });
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const content = [];
    images.forEach((b64, i) => {
      content.push({ type: 'text', text: `【ページ画像 ${i + 1}/${images.length}】${(body.image_labels || [])[i] || ''}` });
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } });
    });
    if (text) content.push({ type: 'text', text: `【設計図書テキスト（pdf.js抽出・CAD図面は文字化けあり。図面は画像を優先）】\nファイル: ${(body.filenames || []).join(', ')}\n\n${text}` });
    content.push({
      type: 'text',
      text: `工事の手がかり: ${body.project_hint || '（なし）'}\n\n上記から床版型枠の構造パラメータを読み取り、スキーマどおりに出力してください。`,
    });

    const request = {
      model,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: { effort: mode === 'precise' ? 'high' : 'medium', format: { type: 'json_schema', schema: SLAB_SCHEMA } },
      system: [
        { type: 'text', text: SYSTEM_PROMPT },
        { type: 'text', text: loadKnowledge(), cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content }],
    };

    const response = await client.messages.create(request);
    if (response.stop_reason === 'refusal') return res.status(502).json({ error: 'AIが応答を拒否しました。設計書の内容を確認してください' });
    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock) return res.status(502).json({ error: 'AIの応答が空でした', stop_reason: response.stop_reason });
    let params;
    try { params = JSON.parse(textBlock.text); } catch (e) { return res.status(502).json({ error: 'AI応答の解析に失敗', raw: textBlock.text.slice(0, 2000) }); }

    // 決定的生成＋検算（パラメータ不足なら json=null で返し、人が補って再生成）
    let json = null, checks = null, genError = null;
    const missing = SlabGenerator.validateParams(params);
    if (!missing.length) {
      try {
        json = SlabGenerator.generateSlabJson({
          ...params,
          skew_direction: params.skew_direction === 'none' ? null : params.skew_direction,
          created_by: `型知（${mode === 'precise' ? '精密' : '標準'}抽出・${auth.employee_number}）`,
          source_refs: (body.filenames || []).map((f) => `設計図書: ${f}`),
        });
        checks = SlabGenerator.checkSlabJson(json);
      } catch (e) { genError = e.message; }
    }

    return res.status(200).json({
      ok: true,
      model: response.model,
      mode,
      params,
      missing,
      json,
      checks,
      gen_error: genError,
      usage: response.usage,
    });
  } catch (e) {
    const status = e && e.status ? e.status : 500;
    console.error('extract error', e);
    return res.status(status >= 400 && status < 600 ? status : 500).json({ error: (e && e.message) || '抽出に失敗しました' });
  }
};
