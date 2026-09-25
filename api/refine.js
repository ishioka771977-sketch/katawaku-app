// ============================================================
// 型知 — 対話で精度を現実に近づける（api/refine.js）
// ============================================================
// 設計書は完璧ではないし、設計変更も普通にある。AIの質問に代理人が答え、
// 現場の実態・設計変更を補足すると、AIがパラメータを更新して「何をなぜ変えたか」を示す。
// やり取りは全部 katachi_dialogue に記録され、得られた知見は katachi_lessons に入って
// 次の現場のプロンプトに自動で載る（記録され次に生かされる）。
//
// POST /api/refine
//   headers: x-employee-number, x-device-id
//   body: { session_id, mode?, params (画面で直した最新), json?,
//           answers: [{ ref_seq, question, answer }], remarks: [string], change_requests: [string] }
//   → { ok, params, changes[], follow_up_questions[], lessons[], summary, json, checks, round, dialogue[] }
// ============================================================
const S = require('./_lib/store');
const SlabGenerator = require('../lib/slab-generator');

const REFINE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['params', 'changes', 'follow_up_questions', 'lessons', 'summary', 'confidence'],
  properties: {
    params: {
      type: 'object', additionalProperties: false,
      required: ['project_name', 'structure_name', 'subtype', 'width_mm', 'length_mm', 'thickness_mm', 'girder_count', 'girder_spacing_mm',
        'base_plate', 'skew_angle_deg', 'skew_direction', 'haunch_depth_mm', 'haunch_width_mm', 'cover_top_mm', 'cover_bottom_mm', 'formwork_scope', 'extra_notes'],
      properties: {
        project_name: { type: 'string' }, structure_name: { type: 'string' },
        subtype: { type: 'string', enum: ['composite_steel_deck', 'rc_slab', 'pc_slab'] },
        width_mm: { type: 'integer' }, length_mm: { type: 'integer' }, thickness_mm: { type: 'integer' },
        girder_count: { type: 'integer' }, girder_spacing_mm: { type: 'integer' },
        base_plate: { type: 'object', additionalProperties: false, required: ['exists', 'thickness_mm', 'material'],
          properties: { exists: { type: 'boolean' }, thickness_mm: { type: ['number', 'null'] }, material: { type: ['string', 'null'] } } },
        skew_angle_deg: { type: 'number' }, skew_direction: { type: 'string', enum: ['right', 'left', 'none'] },
        haunch_depth_mm: { type: ['number', 'null'] }, haunch_width_mm: { type: ['number', 'null'] },
        cover_top_mm: { type: ['number', 'null'] }, cover_bottom_mm: { type: ['number', 'null'] },
    formwork_scope: {
          type: 'object', additionalProperties: false, required: ['end_forms', 'side_forms'],
          description: '型枠範囲。plywood=コンパネ割付が必要／steel_existing=鋼製型枠が上部工等で施工済み（コンパネ不要）／none=不要',
          properties: {
            end_forms: { type: 'string', enum: ['plywood', 'steel_existing', 'none'], description: "妻型枠（A/A'・橋軸方向端部）" },
            side_forms: { type: 'string', enum: ['plywood', 'steel_existing', 'none'], description: "側型枠（B/B'・張出し端）" },
          },
        },
        extra_notes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['category', 'content'], properties: { category: { type: 'string' }, content: { type: 'string' } } } },
      },
    },
    changes: {
      type: 'array', description: '今回の回答・補足で変えたパラメータ（変えていなければ空）',
      items: { type: 'object', additionalProperties: false, required: ['field', 'old_value', 'new_value', 'reason'],
        properties: { field: { type: 'string' }, old_value: { type: 'string' }, new_value: { type: 'string' }, reason: { type: 'string', description: '誰の何の発言・どの根拠で変えたか' } } },
    },
    follow_up_questions: { type: 'array', items: { type: 'string' }, description: 'まだ確認が必要なこと（無ければ空。型枠計画に効くことだけ）' },
    lessons: {
      type: 'array', description: '今回のやり取りから他現場でも使える知見（無ければ空・一般論は書かない）',
      items: { type: 'object', additionalProperties: false, required: ['category', 'title', 'content', 'applies_to_all'],
        properties: { category: { type: 'string', description: '読取り／設計変更／現場条件／型枠工法／失敗／判断基準' }, title: { type: 'string' }, content: { type: 'string', description: '数字・部位・条件を明記。他現場で参照できる粒度' }, applies_to_all: { type: 'boolean', description: '床版以外にも効くならtrue' } } },
    },
    summary: { type: 'string', description: '代理人向けの短いまとめ（何が決まり、何が未決か）' },
    confidence: { type: 'number' },
  },
};

const SYSTEM = `あなたは石岡組の型枠工事計画の補佐AI「型知」です。設計書からの初回読取りのあと、現場代理人と対話して
パラメータを現実に近づけます。設計書は完璧ではなく、設計変更も普通にあります。代理人の発言は現場の実態として尊重しつつ、
設計書の根拠と食い違うときは両方を並べて確認を求めてください。

必ず守ること:
1. 代理人の回答・補足・設計変更を読み、パラメータを更新する。変えた項目は changes に「何を・何から何へ・なぜ」を書く。変えないものは変えない。
2. 未確認で型枠計画に効くことだけ follow_up_questions に残す。細かい一般論は聞かない。1回に多くても3問。
3. 他の現場でも使える具体的な知見だけ lessons に書く（数字・部位・条件つき）。一般論・感想は書かない。無ければ空。
4. 単位は mm。斜角は直橋なら 90 と skew_direction 'none'。
4b. 型枠範囲（formwork_scope）を必ず現実に合わせる: 代理人が「鋼製型枠が施工済み」「妻型枠は不要」と言えば steel_existing／none にする（割付・数量がその面だけ0になる）。ハンチが無いと分かれば haunch_depth_mm=0。
5. 割付・数量は計算しない（コードが計算する）。`;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const auth = await S.verifyDevice(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    const body = await S.readJsonBody(req);
    const sessionId = body.session_id || null;
    const answers = Array.isArray(body.answers) ? body.answers.filter((a) => a && a.answer && String(a.answer).trim()) : [];
    const remarks = (Array.isArray(body.remarks) ? body.remarks : []).map((s) => String(s || '').trim()).filter(Boolean);
    const changeReqs = (Array.isArray(body.change_requests) ? body.change_requests : []).map((s) => String(s || '').trim()).filter(Boolean);
    if (!answers.length && !remarks.length && !changeReqs.length) return res.status(400).json({ error: '回答か補足を1つ以上入れてください' });
    if (!body.params) return res.status(400).json({ error: 'params がありません' });

    let session = null, history = [];
    if (sessionId) {
      try { session = await S.getSession(sessionId); history = await S.getDialogue(sessionId); }
      catch (e) { session = null; }
    }
    const mode = body.mode === 'precise' ? 'precise' : (session && session.mode) || 'standard';
    const structureType = (session && session.structure_type) || body.structure_type || 'deck_slab';

    // 人の発言を記録
    const humanRows = [
      ...answers.map((a) => ({ role: 'human', kind: 'answer', content: `Q: ${a.question || ''}\nA: ${a.answer}`, ref_seq: a.ref_seq || null })),
      ...remarks.map((r) => ({ role: 'human', kind: 'remark', content: r })),
      ...changeReqs.map((r) => ({ role: 'human', kind: 'change_request', content: r })),
    ];
    let warning = null;
    if (session) { try { await S.appendDialogue(session.id, humanRows, auth.employee_number); } catch (e) { warning = e.message; } }

    // これまでの対話（記録が無ければ今回分だけ）
    const transcript = (history.length ? history : []).map((d) => `[${d.seq}] ${d.role === 'ai' ? 'AI' : '代理人'}(${d.kind}): ${d.content}`).join('\n');
    const thisTurn = humanRows.map((r) => `${r.kind === 'answer' ? '回答' : r.kind === 'remark' ? '補足' : '設計変更'}: ${r.content}`).join('\n');

    const lessons = await S.loadLessons(structureType);
    const userText = `【現在のパラメータ（画面で直したものを含む）】\n${JSON.stringify(body.params, null, 1)}\n\n` +
      (transcript ? `【これまでの対話】\n${transcript}\n\n` : '') +
      `【今回の代理人の発言】\n${thisTurn}\n\n上記を踏まえてスキーマどおりに出力してください。`;

    const response = await S.anthropic().messages.create({
      model: S.MODELS[mode],
      max_tokens: 12000,
      thinking: { type: 'adaptive' },
      output_config: { effort: mode === 'precise' ? 'high' : 'medium', format: { type: 'json_schema', schema: REFINE_SCHEMA } },
      system: [
        { type: 'text', text: SYSTEM },
        { type: 'text', text: S.loadKnowledge(), cache_control: { type: 'ephemeral' } },
        ...(lessons.text ? [{ type: 'text', text: lessons.text }] : []),
      ],
      messages: [{ role: 'user', content: userText }],
    });
    if (response.stop_reason === 'refusal') return res.status(502).json({ error: 'AIが応答を拒否しました' });
    const textBlock = response.content.find((b) => b.type === 'text');
    let out;
    try { out = JSON.parse(textBlock.text); } catch (e) { return res.status(502).json({ error: 'AI応答の解析に失敗', raw: (textBlock && textBlock.text || '').slice(0, 2000) }); }

    // 生成＋検算
    const params = { ...body.params, ...out.params };
    let json = null, checks = null, genError = null;
    const missing = SlabGenerator.validateParams(params);
    if (!missing.length) {
      try {
        json = SlabGenerator.generateSlabJson({ ...params, skew_direction: params.skew_direction === 'none' ? null : params.skew_direction,
          created_by: `型知（対話${(session ? session.round_count : 0) + 1}回目・${auth.employee_number}）`, source_refs: (session && session.source_files || []).map((f) => `設計図書: ${f}`) });
        checks = SlabGenerator.checkSlabJson(json);
      } catch (e) { genError = e.message; }
    }

    // AIの発言・変更・知見を記録
    let lessonCount = 0, dialogue = [];
    if (session) {
      try {
        const aiRows = [
          ...out.changes.map((c) => ({ role: 'ai', kind: 'change', content: `${c.field}: ${c.old_value} → ${c.new_value}（${c.reason}）`, field: c.field, old_value: { v: c.old_value }, new_value: { v: c.new_value } })),
          { role: 'ai', kind: 'summary', content: out.summary },
          ...out.follow_up_questions.map((q) => ({ role: 'ai', kind: 'question', content: q })),
        ];
        await S.appendDialogue(session.id, aiRows, 'AI');
        lessonCount = await S.addLessons(session.id, { project_name: session.project_name, structure_type: structureType }, out.lessons, auth.employee_number);
        await S.updateSession(session.id, { params_current: params, json_current: json, round_count: (session.round_count || 0) + 1, mode });
        dialogue = await S.getDialogue(session.id);
      } catch (e) { warning = (warning ? warning + ' / ' : '') + e.message; }
    }

    return res.status(200).json({
      ok: true, model: response.model, mode, session_id: session ? session.id : null,
      params, changes: out.changes, follow_up_questions: out.follow_up_questions, lessons: out.lessons, lessons_saved: lessonCount,
      summary: out.summary, confidence: out.confidence, missing, json, checks, gen_error: genError,
      round: session ? (session.round_count || 0) + 1 : null, dialogue, warning, usage: response.usage,
    });
  } catch (e) {
    console.error('refine error', e);
    const status = e && e.status >= 400 && e.status < 600 ? e.status : 500;
    return res.status(status).json({ error: (e && e.message) || '対話に失敗しました' });
  }
};
