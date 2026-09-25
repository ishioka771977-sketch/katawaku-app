// ============================================================
// 型知 KATACHI — 設計書抽出API (api/extract.js)  Vercel Serverless (Node)
// ============================================================
// 役割: 設計図書（テキスト＋ページ画像）から床版の構造パラメータをAIで読み取り、
//       lib/slab-generator.js で型知JSONを決定的に生成し、検算結果と一緒に返す。
//       AIは「数値を読む」だけ。割付・数量はコードが計算する。
//       読取りは katachi_sessions に記録し、AIの確認事項は対話の最初の質問として残す
//       （続きは api/refine.js で代理人と対話）。過去の知見（katachi_lessons）はプロンプトに載る。
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
//   → { params, questions(seq付き), json, checks, session_id, model, usage }
//
// 環境変数（Vercel）: ANTHROPIC_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// ============================================================
const S = require('./_lib/store');
const SlabGenerator = require('../lib/slab-generator');

const MAX_IMAGES = 12;
const MAX_TOTAL_BASE64 = 5_000_000;
const MAX_TEXT = 200_000;

// ---------- 抽出スキーマ（structured output） ----------
const SLAB_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['project_name', 'structure_name', 'subtype', 'width_mm', 'length_mm', 'thickness_mm',
    'girder_count', 'girder_spacing_mm', 'base_plate', 'skew_angle_deg', 'skew_direction',
    'haunch_depth_mm', 'haunch_width_mm', 'cover_top_mm', 'cover_bottom_mm', 'formwork_scope',
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
    formwork_scope: {
      type: 'object', additionalProperties: false, required: ['end_forms', 'side_forms'],
      description: '型枠範囲。plywood=コンパネ割付が必要／steel_existing=鋼製型枠が上部工等で施工済み（コンパネ不要）／none=不要',
      properties: {
        end_forms: { type: 'string', enum: ['plywood', 'steel_existing', 'none'], description: "妻型枠（A/A'・橋軸方向端部）" },
        side_forms: { type: 'string', enum: ['plywood', 'steel_existing', 'none'], description: "側型枠（B/B'・張出し端）" },
      },
    },
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
    questions: { type: 'array', items: { type: 'string' }, description: '設計書から読めず人（現場代理人）に確認が必要な事項。型枠計画に効くことだけ' },
    extra_notes: {
      type: 'array', description: '型枠計画に効く固有事項（拡幅・変断面・不等間隔主桁・打継ぎ指定など）',
      items: { type: 'object', additionalProperties: false, required: ['category', 'content'], properties: { category: { type: 'string' }, content: { type: 'string' } } },
    },
    confidence: { type: 'number', description: '全体の確信度 0〜1' },
  },
};

const SYSTEM_PROMPT = `あなたは石岡組の型枠工事計画の補佐AI「型知」の抽出エンジンです。
設計図書（一般図・床版図・数量総括表・特記仕様書）から、床版型枠の割付に必要な構造パラメータを読み取ります。
このあと現場代理人と対話して精度を現実に近づけるので、読めないことは推測せず questions に残してください。

必ず守ること:
1. 図面に書かれている数値だけを使う。推測で埋めない。読めない項目は null にして questions に書く。
2. 各数値には evidence を付ける（どのファイルの何ページ、どの図・どの寸法線か）。
3. 幅員は「床版の総幅（地覆を含む外々）」。車道幅員や有効幅員と混同しない。迷ったら両方を evidence に書き、総幅を採用する。
4. 床版長は「床版コンクリートの橋軸方向長さ」。桁長・支間長・橋長と区別する。
5. 主桁本数はG-1〜G-nのラベルの数。間隔は断面図の寸法線から。不等間隔なら代表値＋extra_notesに実配列。
6. 底鋼板（SM490等の鋼板が床版下面に一体）があれば合成床版。RC床版なら base_plate.exists=false。
7. 斜角は平面図の支承線と橋軸のなす角。直橋（90°）なら skew_angle_deg=90、skew_direction='none'。
8. 単位はすべて mm。図面が m 表記なら換算する。
9. 割付・数量は計算しない（コードが計算する）。パラメータの読み取りに集中する。
10. 型枠範囲（formwork_scope）: 図面に「鋼製型枠」「施工済」など外周型枠が既にある根拠があれば steel_existing、無ければ plywood。迷ったら plywood にして questions で確認する。ハンチが図面に無ければ haunch_depth_mm=0。
11. 過去の現場の知見（あれば末尾に載る）に該当する条件があれば、questions か extra_notes で必ず触れる。

以下は型知の知識ベース（JSON仕様と現場知見）。パラメータの意味を確認するために参照すること。`;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const auth = await S.verifyDevice(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    const body = await S.readJsonBody(req);
    const structureType = body.structure_type || 'deck_slab';
    if (structureType !== 'deck_slab') return res.status(400).json({ error: `未対応の構造物: ${structureType}（v1は床版のみ）` });
    const mode = body.mode === 'precise' ? 'precise' : 'standard';
    const model = S.MODELS[mode];

    const text = typeof body.text === 'string' ? body.text.slice(0, MAX_TEXT) : '';
    const images = Array.isArray(body.images) ? body.images.filter((s) => typeof s === 'string' && s) : [];
    if (images.length > MAX_IMAGES) return res.status(400).json({ error: `ページ画像が多すぎます（最大${MAX_IMAGES}枚）` });
    const total = images.reduce((a, s) => a + s.length, 0);
    if (total > MAX_TOTAL_BASE64) return res.status(400).json({ error: '画像データが大きすぎます（ページ数を減らすか解像度を下げてください）' });
    if (!text && !images.length) return res.status(400).json({ error: '設計書のテキストかページ画像が必要です' });

    const content = [];
    images.forEach((b64, i) => {
      content.push({ type: 'text', text: `【ページ画像 ${i + 1}/${images.length}】${(body.image_labels || [])[i] || ''}` });
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } });
    });
    if (text) content.push({ type: 'text', text: `【設計図書テキスト（pdf.js抽出・CAD図面は文字化けあり。図面は画像を優先）】\nファイル: ${(body.filenames || []).join(', ')}\n\n${text}` });
    content.push({ type: 'text', text: `工事の手がかり: ${body.project_hint || '（なし）'}\n\n上記から床版型枠の構造パラメータを読み取り、スキーマどおりに出力してください。` });

    const lessons = await S.loadLessons(structureType);
    const response = await S.anthropic().messages.create({
      model,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: { effort: mode === 'precise' ? 'high' : 'medium', format: { type: 'json_schema', schema: SLAB_SCHEMA } },
      system: [
        { type: 'text', text: SYSTEM_PROMPT },
        { type: 'text', text: S.loadKnowledge(), cache_control: { type: 'ephemeral' } },
        ...(lessons.text ? [{ type: 'text', text: lessons.text }] : []),
      ],
      messages: [{ role: 'user', content }],
    });
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

    // セッション記録（テーブル未作成なら warning を返して続行）
    const created = await S.createSession({
      project_name: params.project_name || body.project_hint || '無名工事',
      structure_type: structureType, structure_name: params.structure_name || null,
      employee_number: auth.employee_number, mode, source_files: body.filenames || [],
      params_initial: params, params_current: params, json_current: json,
    });
    let questions = (params.questions || []).map((q) => ({ seq: null, question: q }));
    let warning = created.warning || null;
    if (created.id) {
      try {
        const r = await S.appendDialogue(created.id, [
          { role: 'ai', kind: 'summary', content: `設計書から読取り（${mode}・確信度${Math.round((params.confidence || 0) * 100)}%）: 幅員${params.width_mm} 床版長${params.length_mm} 版厚${params.thickness_mm} 主桁${params.girder_count}@${params.girder_spacing_mm} 斜角${params.skew_angle_deg}` },
          ...(params.questions || []).map((q) => ({ role: 'ai', kind: 'question', content: q })),
        ], 'AI');
        const qRows = r.rows.filter((x) => x.kind === 'question');
        questions = qRows.map((x) => ({ seq: x.seq, question: x.content }));
      } catch (e) { warning = e.message; }
    }

    return res.status(200).json({
      ok: true, model: response.model, mode, session_id: created.id || null,
      params, questions, missing, json, checks, gen_error: genError,
      lessons_used: lessons.count, warning, usage: response.usage,
    });
  } catch (e) {
    const status = e && e.status ? e.status : 500;
    console.error('extract error', e);
    return res.status(status >= 400 && status < 600 ? status : 500).json({ error: (e && e.message) || '抽出に失敗しました' });
  }
};
