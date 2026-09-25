// ============================================================
// 型知 KATACHI — 床版 割付ジェネレータ (lib/slab-generator.js)
// ============================================================
// 設計書からAIが抽出した「構造パラメータ」を受け取り、型知JSON v3.0
// （deck_slab）を決定的に生成する。AIは数値を読むだけ、割付・数量は
// このコードが計算する（ぶれない・検算できる）。
//
// ルールの出典: knowledge/katachi_setup_v9.md / 05_slab_knowhow.md
//   - 側型枠高さ = 版厚 + 50mm を 10mm 切上げ
//   - パネルは 1800mm 片追い、端数は実数（丸め禁止）
//   - セパ: C型 2分5厘 @600 端あき150 1段（版厚230以下）
//   - セパ本数 = (floor((面幅 − 2×端あき) ÷ ピッチ) + 1) × 段数
//   - 斜角: 妻面長 = 幅員 ÷ sinθ（±1mm）
//   - ハンチ: 主桁1本につき左右2枚の加工材
//   - 合成床版（底鋼板あり）: 底型枠・支保工は不要
//
// Node（api/extract.js）でもブラウザ（index.html）でも同じコードが動く。
// ============================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SlabGenerator = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PANEL_W = 1800;          // コンパネ原板 長辺
  const PANEL_H = 900;           // コンパネ原板 短辺
  const SEP_PITCH = 600;
  const SEP_EDGE = 150;
  const SIDE_ALLOWANCE = 50;     // 側型枠の余裕
  const SINGLE_ROW_MAX_H = 230;  // この高さ以下ならセパ1段

  const round2 = (x) => Math.round(x * 100) / 100;

  function sideFormHeight(thickness_mm) {
    return Math.ceil((thickness_mm + SIDE_ALLOWANCE) / 10) * 10;
  }

  function separatorRows(height_mm) {
    return height_mm <= SINGLE_ROW_MAX_H ? 1 : 2;
  }

  function separatorCount(width_mm, rows, pitch, edge) {
    return (Math.floor((width_mm - 2 * edge) / pitch) + 1) * rows;
  }

  // 片追い割付: 1800幅を並べ、端数は実数で1枚
  function panelize(faceId, width_mm, height_mm) {
    const panels = [];
    let remain = width_mm;
    let col = 1;
    while (remain > 0) {
      const w = remain >= PANEL_W ? PANEL_W : remain;
      const full = w === PANEL_W;
      panels.push({
        id: `${faceId}-1-${String(col).padStart(2, '0')}`,
        row: 1,
        col,
        width_mm: w,
        height_mm,
        type: 'カット',
        orientation: '横',
        cut_note: full ? `${height_mm}mm幅にカット` : `${w}×${height_mm}mmにカット`,
      });
      remain -= w;
      col++;
    }
    return panels;
  }

  function makeSeparators(width_mm, height_mm, thickness_mm) {
    const rows = separatorRows(height_mm);
    return {
      type: 'C型',
      diameter: '2分5厘',
      pitch_h_mm: SEP_PITCH,
      pitch_v_mm: rows > 1 ? Math.round(height_mm / 2 / 10) * 10 : null,
      edge_margin_mm: SEP_EDGE,
      rows,
      length_mm: thickness_mm,
      wall_thickness_mm: thickness_mm,
      count: separatorCount(width_mm, rows, SEP_PITCH, SEP_EDGE),
      note: rows === 1 ? `版厚${SINGLE_ROW_MAX_H}mm以下のため1段のみ` : '側型枠高さが大きいため2段',
    };
  }

  function makeSideFace(id, name, width_mm, height_mm, thickness_mm, finish) {
    return {
      id,
      name,
      face_type: 'side',
      width_mm,
      height_mm,
      finish,
      layout_method: '片追い',
      panels: panelize(id, width_mm, height_mm),
      separators: makeSeparators(width_mm, height_mm, thickness_mm),
    };
  }

  // 数量: 面×サイズで集計
  function summarizePanels(faces) {
    const summary = [];
    for (const f of faces) {
      if (f.face_type === 'haunch') {
        summary.push({ face: 'ハンチ', size: '加工材', type: 'カット', count: f.total_panels, area_m2: null });
        continue;
      }
      const bySize = new Map();
      for (const p of f.panels) {
        const key = `${p.width_mm}×${p.height_mm}`;
        const cur = bySize.get(key) || { count: 0, area: 0 };
        cur.count++;
        cur.area += (p.width_mm * p.height_mm) / 1e6;
        bySize.set(key, cur);
      }
      for (const [size, v] of bySize) {
        summary.push({ face: `${f.id}面`, size, type: 'カット', count: v.count, area_m2: round2(v.area) });
      }
    }
    return summary;
  }

  /**
   * 構造パラメータ → 型知JSON v3.0（deck_slab）
   * @param {object} p
   *  project_name, contractor, created_by,
   *  structure_name, subtype ('composite_steel_deck'|'rc_slab'),
   *  width_mm, length_mm, thickness_mm,
   *  haunch_depth_mm(50), haunch_width_mm(200), camber_mm(10), longitudinal_slope_percent(0),
   *  skew_angle_deg(90), skew_direction('right'|'left'|null),
   *  girder_count, girder_spacing_mm,
   *  cover_top_mm(75), cover_bottom_mm(30),
   *  base_plate {exists, thickness_mm, material},
   *  extra_notes: [{category, content}], source_refs: [string]
   */
  function generateSlabJson(p) {
    const errors = validateParams(p);
    if (errors.length) throw new Error('パラメータ不足: ' + errors.join(' / '));

    const W = Math.round(p.width_mm);
    const L = Math.round(p.length_mm);
    const T = Math.round(p.thickness_mm);
    const skew = p.skew_angle_deg == null ? 90 : Number(p.skew_angle_deg);
    const isSkew = Math.abs(skew - 90) > 0.01;
    const H = sideFormHeight(T);
    const hd = p.haunch_depth_mm == null ? 50 : p.haunch_depth_mm;
    const hw = p.haunch_width_mm == null ? 200 : p.haunch_width_mm;
    const camber = p.camber_mm == null ? 10 : p.camber_mm;
    const gc = Math.round(p.girder_count);
    const gs = Math.round(p.girder_spacing_mm);
    const bp = p.base_plate || { exists: false };
    const composite = !!bp.exists;
    const subtype = p.subtype || (composite ? 'composite_steel_deck' : 'rc_slab');
    const coverTop = p.cover_top_mm == null ? 75 : p.cover_top_mm;
    const coverBottom = p.cover_bottom_mm == null ? 30 : p.cover_bottom_mm;

    // 妻面長（斜角なら実長）
    const endW = isSkew ? Math.round(W / Math.sin(skew * Math.PI / 180)) : W;
    const skewTag = isSkew ? `（斜角${skew}°・実長）` : '';

    const faces = [
      makeSideFace('A', `橋軸方向端部（A1側・妻型枠）${skewTag}`, endW, H, T, '埋設（地覆で隠れる）'),
      makeSideFace("A'", `橋軸方向端部（A2側・妻型枠）${skewTag}`, endW, H, T, '埋設（地覆で隠れる）'),
      makeSideFace('B', '橋幅方向端部（上流側）', L, H, T, '埋設'),
      makeSideFace("B'", '橋幅方向端部（下流側）', L, H, T, '埋設'),
      {
        id: 'H',
        name: 'ハンチ部（主桁取合い）',
        face_type: 'haunch',
        note: '主桁上フランジとの取合い。角度カット合板',
        haunch_depth_mm: hd,
        haunch_width_mm: hw,
        girder_count: gc,
        panels_per_girder: 2,
        total_panels: gc * 2,
        panel_note: '三角形にカットした合板。主桁1本につき左右2枚',
      },
    ];

    const panelSummary = summarizePanels(faces);
    const totalCount = panelSummary.reduce((a, r) => a + r.count, 0);
    const totalArea = round2(panelSummary.reduce((a, r) => a + (r.area_m2 || 0), 0));
    const rawSheets = Math.ceil(totalArea / ((PANEL_W * PANEL_H) / 1e6));

    const sepSummary = faces
      .filter((f) => f.separators)
      .map((f) => ({ face: `${f.id}面`, type: f.separators.type, diameter: f.separators.diameter, length_mm: f.separators.length_mm, count: f.separators.count }));
    const sepTotal = sepSummary.reduce((a, r) => a + r.count, 0);

    const labels = Array.from({ length: gc }, (_, i) => `G-${i + 1}`);
    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

    const notes = [
      { category: 'かぶり', content: `上面: ${coverTop}mm、下面: ${coverBottom}mm${composite ? '（底鋼板側）' : ''}。スペーサーは1m²あたり4個以上` },
      { category: '打継ぎ', content: '原則として打継ぎなしの連続打設。やむを得ない場合は主桁上または1/4点付近' },
      { category: 'ハンチ', content: '主桁上フランジとの取合い部。角度カット合板で傾斜面を形成。隙間はテープで塞ぐ' },
      { category: '水抜き', content: '底型枠（通常床版の場合）の低い位置にブリーディング水排出口を設ける' },
      { category: '上げ越し', content: `底型枠に上げ越し（キャンバー）${camber}mmを設定。支保工ジャッキで微調整` },
    ];
    if (composite) {
      notes.push({
        category: `${p.structure_name || '本橋'}固有`,
        content: `底鋼板t=${bp.thickness_mm ?? '?'}mm（${bp.material || '材質未記載'}）が底型枠の役割。I形鋼が支保工の役割。底型枠コンパネ・パイプサポートは不要`,
      });
    } else {
      notes.push({ category: 'RC床版', content: '底型枠（コンパネ＋根太）と支保工（パイプサポート＋大引）が必要。荷重計算は05_slab_knowhow参照' });
    }
    if (isSkew) {
      notes.push({ category: '斜角', content: `斜角${skew}°（${p.skew_direction || '向き未判定'}）。妻面長は幅員÷sin${skew}°=${endW}mm。端部カットパネルは実数寸法` });
    }
    for (const n of p.extra_notes || []) if (n && n.content) notes.push({ category: n.category || '設計書', content: n.content });
    if (p.source_refs && p.source_refs.length) notes.push({ category: '出典', content: p.source_refs.join(' / ') });

    const dims = { width_mm: W, length_mm: L, thickness_mm: T, haunch_depth_mm: hd, haunch_width_mm: hw, camber_mm: camber };
    if (p.longitudinal_slope_percent != null) dims.longitudinal_slope_percent = p.longitudinal_slope_percent;
    if (isSkew) { dims.skew_angle_deg = skew; dims.skew_direction = p.skew_direction || 'right'; }

    return {
      version: '3.0',
      project: {
        name: p.project_name || '無名工事',
        contractor: p.contractor || '（株）石岡組',
        created_at: today,
        created_by: p.created_by || '型知（設計書抽出）',
      },
      structure: {
        type: 'deck_slab',
        name: p.structure_name || `${p.project_name || ''} 床版`.trim(),
        subtype,
        dimensions: dims,
        girders: { count: gc, spacing_mm: gs, labels },
        cover: { top_mm: coverTop, bottom_mm: coverBottom },
        base_plate: composite
          ? { exists: true, thickness_mm: bp.thickness_mm ?? null, material: bp.material || null, note: '底鋼板が底型枠の役割。底型枠コンパネ不要' }
          : { exists: false },
        formwork_config: {
          bottom_form_required: !composite,
          side_form_required: true,
          haunch_form_required: true,
          shoring_required: !composite,
          shoring_note: composite ? 'I形鋼＋底鋼板が支保工の役割' : 'パイプサポート＋大引＋根太',
        },
        joints: {
          expansion_joints: [],
          construction_joints: [
            { position: '打継ぎ（やむを得ない場合）', direction: 'vertical', position_mm: Math.round(L / 2), treatment: '主桁上または1/4点付近', note: '原則打継ぎなし。やむを得ない場合のみ' },
          ],
          note: '連続打設が原則。打継ぎ位置は主桁上or1/4点',
        },
      },
      phases: [{ phase: 1, name: '床版打設', note: '打継ぎなしの連続打設が原則', faces }],
      quantities: {
        panels: {
          summary: panelSummary,
          total_count: totalCount,
          total_area_m2: totalArea,
          note: `全てカット材（${H}mm幅にカット）。コンパネ原板(900×1800)換算: 約${rawSheets}枚`,
        },
        separators: { summary: sepSummary, total_count: sepTotal },
        hardware: {
          formtie: { spec: 'W5/16', count: sepTotal * 2, note: 'セパ×2' },
          nut: { spec: 'W5/16六角', count: sepTotal * 2, note: 'C型セパ×2' },
          washer: { spec: 'W5/16用', count: sepTotal * 2, note: 'フォームタイと同数' },
        },
        joints: {
          summary: [{ name: '打継ぎ処理', spec: 'レイタンス除去・チッピング・湿潤', count: 0, unit: '箇所', note: '連続打設が原則' }],
          total_joints: 0,
        },
        misc: [
          { name: '桟木', spec: '30×60×3600', count: Math.max(30, Math.ceil((2 * (endW + L)) / 3600 / 2)), unit: '本' },
          { name: '面木', spec: '15×15三角', count: Math.max(60, Math.ceil((2 * (endW + L)) / 1000)), unit: 'm' },
          { name: '剥離剤', spec: '鉱物油系', count: 1, unit: '缶' },
          { name: '布テープ', spec: '50mm幅', count: 5, unit: '巻' },
          { name: 'スペーサー', spec: `かぶり${coverTop}mm用`, count: Math.max(200, Math.ceil((W * L) / 1e6) * 4), unit: '個' },
        ],
      },
      notes,
    };
  }

  function validateParams(p) {
    const e = [];
    if (!p) return ['パラメータなし'];
    for (const k of ['width_mm', 'length_mm', 'thickness_mm', 'girder_count', 'girder_spacing_mm']) {
      if (p[k] == null || !isFinite(Number(p[k])) || Number(p[k]) <= 0) e.push(k);
    }
    if (p.skew_angle_deg != null && (p.skew_angle_deg <= 0 || p.skew_angle_deg > 90)) e.push('skew_angle_deg(0<θ≤90)');
    return e;
  }

  // 検算: modules/slab.js validateIntegrity と同じ式（サーバ側でも同じ結果になる）
  function checkSlabJson(data) {
    const rows = [];
    const d = (data.structure && data.structure.dimensions) || {};
    const skew = d.skew_angle_deg || 90;
    const isSkew = Math.abs(skew - 90) > 0.01;
    for (const ph of data.phases || []) {
      for (const f of ph.faces || []) {
        if (f.face_type === 'haunch') continue;
        if (isSkew && (f.id === 'A' || f.id === "A'")) {
          const expect = d.width_mm / Math.sin(skew * Math.PI / 180);
          rows.push({ label: `${f.id}面 妻面長`, ok: Math.abs(f.width_mm - expect) <= 1, detail: `${f.width_mm}mm（期待 ${Math.round(expect)}mm）` });
        }
        const total = (f.panels || []).reduce((a, x) => a + (x.width_mm || 0), 0);
        rows.push({ label: `${f.id}面 パネル幅合計`, ok: Math.abs(total - f.width_mm) <= 1, detail: `${total}mm（面幅 ${f.width_mm}mm）` });
        const sp = f.separators;
        if (sp) {
          const expect = separatorCount(f.width_mm, sp.rows || 1, sp.pitch_h_mm, sp.edge_margin_mm);
          rows.push({ label: `${f.id}面 セパ本数`, ok: Math.abs(sp.count - expect) <= 1, detail: `${sp.count}本（式期待 ${expect}本）` });
        }
      }
    }
    const q = data.quantities || {};
    if (q.panels && Array.isArray(q.panels.summary)) {
      const sum = q.panels.summary.reduce((a, r) => a + r.count, 0);
      rows.push({ label: 'パネル総数', ok: sum === q.panels.total_count, detail: `${sum}枚（記載 ${q.panels.total_count}枚）` });
    }
    if (q.separators && Array.isArray(q.separators.summary)) {
      const sum = q.separators.summary.reduce((a, r) => a + r.count, 0);
      rows.push({ label: 'セパ総数', ok: sum === q.separators.total_count, detail: `${sum}本（記載 ${q.separators.total_count}本）` });
    }
    return { ok: rows.every((r) => r.ok), rows };
  }

  return { generateSlabJson, checkSlabJson, validateParams, sideFormHeight, separatorCount, panelize };
});
