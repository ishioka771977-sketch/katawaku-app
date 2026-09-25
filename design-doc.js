// ============================================================
// 型知 KATACHI — 設計書から作成（design-doc.js）
// ============================================================
// 人の操作: ①設計図書PDFを選ぶ → ②AIに読ませる → ③数値を確認 → ④型知に読み込む
// 裏の仕事: pdf.jsでテキスト＋候補ページ画像を作る → /api/extract（登録端末のみ）
//           → AIが構造パラメータを読む → lib/slab-generator.js が割付を決定的に生成
//           → 検算（パネル幅合計・セパ本数）→ OKなら型知本体へ
// ============================================================
(function () {
  'use strict';

  const PDFJS_VER = '3.11.174';
  const PDFJS_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}/pdf.min.js`;
  const PDFJS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}/pdf.worker.min.js`;
  const MAX_IMAGES = 12;
  const MAX_TOTAL_BASE64 = 4_600_000; // サーバ上限5.0Mに余裕
  const MAX_TEXT = 120_000;
  // 図面ページの自動選択キーワード（目次ではなく本文ページに出る語）
  const PAGE_KEYWORDS = ['一般図', '床版図', '構造一般図', '断面図', '配筋', '標準断面'];
  const TEXT_KEYWORDS = ['床版', '合成床版', '幅員', '主桁', '底鋼板', '斜角', '数量総括', '特記'];

  const state = { files: [], pages: [], params: null, json: null, checks: null, mode: 'standard', busy: false };

  // ---------- pdf.js ----------
  let _pdfjs = null;
  function loadPdfjs() {
    if (_pdfjs) return Promise.resolve(_pdfjs);
    if (window.pdfjsLib) { _pdfjs = window.pdfjsLib; _pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; return Promise.resolve(_pdfjs); }
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PDFJS_URL;
      s.onload = () => { _pdfjs = window.pdfjsLib; _pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; resolve(_pdfjs); };
      s.onerror = () => reject(new Error('pdf.js の読込に失敗しました'));
      document.head.appendChild(s);
    });
  }

  // CAD図面PDFは文字化けする → 化け率でテキスト採用可否を判定
  function garbledRatio(t) {
    if (!t) return 1;
    let bad = 0;
    for (const ch of t) { const c = ch.charCodeAt(0); if ((c >= 0x3100 && c <= 0x312f) || (c >= 0x0e00 && c <= 0x0e7f) || (c >= 0xe000 && c <= 0xf8ff)) bad++; }
    return bad / t.length;
  }

  async function scanFile(file) {
    const pdfjs = await loadPdfjs();
    const buf = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: buf }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      const text = tc.items.map((it) => it.str).join(' ');
      const garbled = garbledRatio(text);
      const isDrawing = page.view && (page.view[2] > page.view[3]); // 横長=図面の可能性
      const kwHit = PAGE_KEYWORDS.filter((k) => text.includes(k));
      const txtHit = TEXT_KEYWORDS.filter((k) => text.includes(k));
      pages.push({ file: file.name, pdf, pageNo: i, text, garbled, isDrawing, kwHit, txtHit, selected: false, thumb: null });
    }
    return pages;
  }

  async function renderPage(p, scale, quality) {
    const page = await p.pdf.getPage(p.pageNo);
    const vp0 = page.getViewport({ scale: 1 });
    const s = scale / Math.max(vp0.width, vp0.height);
    const vp = page.getViewport({ scale: s });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return canvas.toDataURL('image/jpeg', quality);
  }

  // ---------- UI ----------
  function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; }
  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function ensureModal() {
    let m = document.getElementById('ddModal');
    if (m) return m;
    m = el(`
      <div id="ddModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9000;overflow:auto">
        <div style="background:#fff;max-width:900px;margin:30px auto;border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,.3)">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #ddd;background:#2c3e50;color:#fff;border-radius:8px 8px 0 0">
            <b>📐 設計書から作成（床版）</b>
            <button onclick="DesignDoc.close()" style="background:none;border:none;color:#fff;font-size:20px;cursor:pointer">✕</button>
          </div>
          <div id="ddBody" style="padding:16px;font-size:14px"></div>
        </div>
      </div>`);
    document.body.appendChild(m);
    return m;
  }

  function open() {
    ensureModal().style.display = 'block';
    renderStep1();
  }
  function close() { const m = document.getElementById('ddModal'); if (m) m.style.display = 'none'; }

  function renderStep1() {
    const b = document.getElementById('ddBody');
    b.innerHTML = `
      <p style="margin-top:0">設計図書のPDF（設計図・数量総括表・特記仕様書）を選ぶと、裏でAIが床版の寸法を読み取り、型知の割付を自動で作ります。</p>
      <div class="card"><div class="card-header">① 設計図書を選ぶ</div><div class="card-body">
        <input type="file" id="ddFiles" accept="application/pdf" multiple style="font-size:14px">
        <div style="margin-top:8px;color:#666;font-size:12px">複数選択OK。図面PDF（fig）は必ず含めてください。</div>
        <div id="ddScan" style="margin-top:10px"></div>
      </div></div>
      <div class="card"><div class="card-header">② AIに読ませるページ</div><div class="card-body">
        <div id="ddPages" style="color:#888">PDFを選ぶと候補ページを自動で選びます（一般図・床版図・断面図）。</div>
      </div></div>
      <div class="card"><div class="card-header">③ 読み取りモード</div><div class="card-body">
        <label style="margin-right:16px"><input type="radio" name="ddMode" value="standard" ${state.mode === 'standard' ? 'checked' : ''}> 標準（速い・普段はこちら）</label>
        <label><input type="radio" name="ddMode" value="precise" ${state.mode === 'precise' ? 'checked' : ''}> 精密（時間がかかる・複雑な図面向け）</label>
        <div style="margin-top:6px;color:#666;font-size:12px">工事名の手がかり（任意）: <input id="ddHint" type="text" style="width:60%;font-size:13px" placeholder="例: 宿野辺橋床版工事（合成床版）"></div>
      </div></div>
      <div class="btn-group" style="margin-top:8px">
        <button class="btn btn-primary" id="ddRun" disabled onclick="DesignDoc.run()">AIに読ませる</button>
        <span id="ddStatus" style="margin-left:10px;color:#666"></span>
      </div>`;
    document.getElementById('ddFiles').addEventListener('change', onFiles);
    b.querySelectorAll('input[name=ddMode]').forEach((r) => r.addEventListener('change', (e) => { state.mode = e.target.value; }));
  }

  async function onFiles(e) {
    const files = [...e.target.files].filter((f) => /\.pdf$/i.test(f.name));
    if (!files.length) return;
    const scan = document.getElementById('ddScan');
    scan.textContent = 'PDFを読んでいます…';
    state.pages = [];
    try {
      for (const f of files) {
        scan.textContent = `${f.name} を読んでいます…`;
        const pages = await scanFile(f);
        state.pages.push(...pages);
      }
    } catch (err) {
      scan.textContent = '読込に失敗: ' + err.message;
      return;
    }
    // 自動選択（CAD図面はテキストが化けるので、目次ページの「図面名 番号」から逆引きする）
    const cand = autoSelectPages(state.pages);
    cand.slice(0, MAX_IMAGES).forEach((p) => { p.selected = true; });
    scan.textContent = `${files.length}ファイル・${state.pages.length}ページ。候補 ${Math.min(cand.length, MAX_IMAGES)} ページを自動選択しました（変更できます）。`;
    await renderPageList();
    document.getElementById('ddRun').disabled = false;
  }

  // 目次ページ（「設計図目次」）の「図面名 図面番号」を読み、図面番号→PDFページに変換する。
  // 図面1は目次の次のページから始まる前提（表紙1・目次1なら 図面n = p(n+2)）。
  // 目次が無いPDFは、キーワードの当たったページ＋横長ページの先頭数枚で代用。
  const TOC_PRIORITY = [/一般図/, /床版図/, /標準断面/, /断面図/, /配筋/];
  function autoSelectPages(pages) {
    const byFile = new Map();
    for (const p of pages) { if (!byFile.has(p.file)) byFile.set(p.file, []); byFile.get(p.file).push(p); }
    const picked = [];
    for (const [, list] of byFile) {
      const toc = list.find((p) => /目次/.test(p.text) && p.garbled < 0.2);
      if (toc) {
        const entries = [];
        const re = /([^\s\d()（）]{2,20}(?:[(（]\d+[)）])?)\s+(\d{1,3})(?=\s|$)/g;
        let m;
        while ((m = re.exec(toc.text))) {
          const name = m[1], no = Number(m[2]);
          const pri = TOC_PRIORITY.findIndex((r) => r.test(name));
          if (pri >= 0 && no >= 1) entries.push({ name, no, pri });
        }
        entries.sort((a, b) => a.pri - b.pri || a.no - b.no);
        const seen = new Set();
        for (const e of entries) {
          const pageNo = e.no + toc.pageNo;
          const p = list.find((x) => x.pageNo === pageNo);
          if (p && !seen.has(pageNo)) { seen.add(pageNo); p.kwHit = [e.name]; picked.push(p); }
        }
        if (picked.length) continue;
      }
      // 目次なし: 文字が読めるPDF（数量総括・特記など）はテキストで渡すので画像にしない。
      // 化けているPDF（図面）だけ、キーワード命中 → 横長ページ先頭4枚 を画像にする
      const readable = list.filter((p) => p.text.length > 50 && p.garbled < 0.05).length >= list.length * 0.7;
      if (readable) continue;
      const kw = list.filter((p) => p.kwHit.length && !/目次/.test(p.text));
      if (kw.length) picked.push(...kw);
      else picked.push(...list.filter((p) => p.isDrawing).slice(0, 4));
    }
    return picked;
  }

  async function renderPageList() {
    const box = document.getElementById('ddPages');
    box.innerHTML = '';
    const list = state.pages.filter((p) => p.selected || p.kwHit.length || p.isDrawing);
    if (!list.length) { box.textContent = '図面らしいページが見つかりません。PDFを確認してください。'; return; }
    for (const p of list) {
      const id = `ddp_${p.file}_${p.pageNo}`.replace(/[^\w]/g, '_');
      const row = el(`<label style="display:inline-block;width:150px;margin:4px;vertical-align:top;font-size:12px;cursor:pointer">
        <input type="checkbox" id="${id}" ${p.selected ? 'checked' : ''}>
        <span>${escapeHtml(p.file)} p${p.pageNo}</span>
        <div class="dd-thumb" style="height:100px;border:1px solid #ddd;background:#f7f7f7;margin-top:2px;overflow:hidden"></div>
        <div style="color:#888">${escapeHtml(p.kwHit.join('・') || (p.isDrawing ? '図面?' : ''))}</div>
      </label>`);
      row.querySelector('input').addEventListener('change', (e) => { p.selected = e.target.checked; updateCount(); });
      box.appendChild(row);
      renderPage(p, 300, 0.6).then((url) => { const img = new Image(); img.src = url; img.style.width = '100%'; row.querySelector('.dd-thumb').appendChild(img); }).catch(() => {});
    }
    const cnt = el(`<div id="ddCount" style="margin-top:6px;color:#666"></div>`);
    box.appendChild(cnt);
    updateCount();
  }
  function updateCount() {
    const n = state.pages.filter((p) => p.selected).length;
    const c = document.getElementById('ddCount');
    if (c) c.textContent = `選択 ${n} ページ（最大 ${MAX_IMAGES}）` + (n > MAX_IMAGES ? ' ⚠ 多すぎます' : '');
  }

  function sessionHeaders() {
    const u = (typeof getLoggedInUser === 'function') ? getLoggedInUser() : null;
    const emp = u && (u.employee_number || u.employeeNumber);
    const dev = (typeof getKatachiDeviceId === 'function') ? getKatachiDeviceId() : '';
    return { 'Content-Type': 'application/json', 'x-employee-number': emp || '', 'x-device-id': dev || '' };
  }

  async function run() {
    if (state.busy) return;
    const sel = state.pages.filter((p) => p.selected);
    if (!sel.length) { alert('AIに読ませるページを1つ以上選んでください'); return; }
    if (sel.length > MAX_IMAGES) { alert(`ページは最大${MAX_IMAGES}枚までです`); return; }
    const status = document.getElementById('ddStatus');
    const btn = document.getElementById('ddRun');
    state.busy = true; btn.disabled = true;
    try {
      // ページ画像（長辺2000px・品質0.72、超えたら段階的に下げる）
      let images = [];
      for (const [scale, q] of [[2000, 0.72], [1700, 0.65], [1400, 0.6]]) {
        images = [];
        for (let i = 0; i < sel.length; i++) {
          status.textContent = `ページ画像を作成中 ${i + 1}/${sel.length}…`;
          images.push((await renderPage(sel[i], scale, q)).split(',')[1]);
        }
        if (images.reduce((a, s) => a + s.length, 0) <= MAX_TOTAL_BASE64) break;
      }
      // テキスト: 化けていないページを床版関連優先で
      const textPages = state.pages.filter((p) => p.garbled < 0.05 && p.text.length > 50)
        .sort((a, b) => b.txtHit.length - a.txtHit.length);
      let text = '';
      for (const p of textPages) {
        const chunk = `\n\n### ${p.file} p${p.pageNo}\n${p.text}`;
        if (text.length + chunk.length > MAX_TEXT) break;
        text += chunk;
      }
      status.textContent = `AIが設計書を読んでいます（${state.mode === 'precise' ? '精密' : '標準'}）… 1〜3分かかります`;
      const body = {
        structure_type: 'deck_slab', mode: state.mode, text, images,
        image_labels: sel.map((p) => `${p.file} p${p.pageNo}`),
        filenames: [...new Set(state.pages.map((p) => p.file))],
        project_hint: (document.getElementById('ddHint') || {}).value || '',
      };
      const res = await fetch('/api/extract', { method: 'POST', headers: sessionHeaders(), body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      state.params = data.params; state.json = data.json; state.checks = data.checks;
      state.lastMeta = { model: data.model, usage: data.usage, missing: data.missing, gen_error: data.gen_error };
      renderStep2();
    } catch (err) {
      status.textContent = '失敗: ' + err.message;
      btn.disabled = false;
    } finally { state.busy = false; }
  }

  const FIELDS = [
    ['project_name', '工事名', 'text'], ['structure_name', '構造物名', 'text'],
    ['subtype', '床版種別', 'select'],
    ['width_mm', '総幅員 (mm)', 'number'], ['length_mm', '床版長 (mm)', 'number'], ['thickness_mm', '床版厚 (mm)', 'number'],
    ['girder_count', '主桁本数', 'number'], ['girder_spacing_mm', '主桁間隔 (mm)', 'number'],
    ['skew_angle_deg', '斜角 (°)', 'number'], ['skew_direction', '斜角の向き', 'skew'],
    ['haunch_depth_mm', 'ハンチ高 (mm)', 'number'], ['haunch_width_mm', 'ハンチ幅 (mm)', 'number'],
    ['cover_top_mm', '上面かぶり (mm)', 'number'], ['cover_bottom_mm', '下面かぶり (mm)', 'number'],
  ];

  function evidenceFor(field) {
    const ev = (state.params && state.params.evidence) || [];
    return ev.filter((e) => e.field === field || e.field.startsWith(field + '.'));
  }

  function renderStep2() {
    const b = document.getElementById('ddBody');
    const p = state.params;
    const bp = p.base_plate || {};
    const conf = Math.round((p.confidence || 0) * 100);
    const rows = FIELDS.map(([k, label, type]) => {
      const v = p[k];
      const ev = evidenceFor(k);
      const evHtml = ev.map((e) => `<div style="color:#666;font-size:11px">根拠: ${escapeHtml(e.source)}（${Math.round((e.confidence || 0) * 100)}%）</div>`).join('');
      let input;
      if (type === 'select') input = `<select data-k="${k}"><option value="composite_steel_deck" ${v === 'composite_steel_deck' ? 'selected' : ''}>合成床版（底鋼板あり）</option><option value="rc_slab" ${v === 'rc_slab' ? 'selected' : ''}>RC床版</option><option value="pc_slab" ${v === 'pc_slab' ? 'selected' : ''}>PC床版</option></select>`;
      else if (type === 'skew') input = `<select data-k="${k}"><option value="none" ${!v || v === 'none' ? 'selected' : ''}>直橋</option><option value="right" ${v === 'right' ? 'selected' : ''}>right</option><option value="left" ${v === 'left' ? 'selected' : ''}>left</option></select>`;
      else input = `<input data-k="${k}" type="${type}" value="${escapeHtml(v ?? '')}" style="width:${type === 'number' ? '110px' : '95%'}">`;
      const warn = (v == null && type === 'number' && ['width_mm', 'length_mm', 'thickness_mm', 'girder_count', 'girder_spacing_mm'].includes(k)) ? ' <span style="color:#e67e22">⚠ 未読取・入力してください</span>' : '';
      return `<tr><td style="white-space:nowrap">${label}</td><td>${input}${warn}${evHtml}</td></tr>`;
    }).join('');
    const bpRows = `<tr><td>底鋼板</td><td>
        <label><input type="checkbox" data-k="bp_exists" ${bp.exists ? 'checked' : ''}> あり</label>
        厚 <input data-k="bp_thickness" type="number" value="${escapeHtml(bp.thickness_mm ?? '')}" style="width:80px"> mm
        材質 <input data-k="bp_material" type="text" value="${escapeHtml(bp.material ?? '')}" style="width:120px">
        ${evidenceFor('base_plate').map((e) => `<div style="color:#666;font-size:11px">根拠: ${escapeHtml(e.source)}</div>`).join('')}
      </td></tr>`;
    const qs = (p.questions || []).map((q) => `<li>${escapeHtml(q)}</li>`).join('');
    const notes = (p.extra_notes || []).map((n) => `<li><b>${escapeHtml(n.category)}</b>: ${escapeHtml(n.content)}</li>`).join('');
    b.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <b>④ 読み取り結果を確認（AIの確信度 ${conf}%）</b>
        <span style="color:#666;font-size:12px">${escapeHtml(state.lastMeta.model || '')}</span>
      </div>
      <div class="card" style="margin-top:8px"><div class="card-header">構造パラメータ（直せます）</div><div class="card-body">
        <table style="width:100%">${rows}${bpRows}</table>
      </div></div>
      ${qs ? `<div class="card"><div class="card-header" style="background:#fdf2e9">AIから人への確認事項</div><div class="card-body"><ul style="margin:0;padding-left:18px">${qs}</ul></div></div>` : ''}
      ${notes ? `<div class="card"><div class="card-header">設計書からの申し送り（notesに入ります）</div><div class="card-body"><ul style="margin:0;padding-left:18px">${notes}</ul></div></div>` : ''}
      <div id="ddChecks"></div>
      <div class="btn-group" style="margin-top:8px">
        <button class="btn btn-primary" onclick="DesignDoc.generate()">⑤ 割付を生成して検算</button>
        <button class="btn btn-success" id="ddApply" ${state.json ? '' : 'disabled'} onclick="DesignDoc.apply()">⑥ 型知に読み込む</button>
        <button class="btn" onclick="DesignDoc.back()">← やり直す</button>
      </div>`;
    if (state.checks) renderChecks();
  }

  function collectParams() {
    const b = document.getElementById('ddBody');
    const p = { ...state.params };
    b.querySelectorAll('[data-k]').forEach((inp) => {
      const k = inp.dataset.k;
      if (k === 'bp_exists') return;
      if (k === 'bp_thickness') return;
      if (k === 'bp_material') return;
      if (inp.type === 'number') p[k] = inp.value === '' ? null : Number(inp.value);
      else p[k] = inp.value;
    });
    p.base_plate = {
      exists: b.querySelector('[data-k=bp_exists]').checked,
      thickness_mm: b.querySelector('[data-k=bp_thickness]').value === '' ? null : Number(b.querySelector('[data-k=bp_thickness]').value),
      material: b.querySelector('[data-k=bp_material]').value || null,
    };
    if (p.skew_direction === 'none') p.skew_direction = null;
    return p;
  }

  function generate() {
    const p = collectParams();
    const missing = SlabGenerator.validateParams(p);
    if (missing.length) { alert('入力が足りません: ' + missing.join(', ')); return; }
    try {
      const u = (typeof getLoggedInUser === 'function') ? getLoggedInUser() : null;
      state.json = SlabGenerator.generateSlabJson({
        ...p,
        created_by: `型知（設計書抽出・${(u && u.name) || (u && u.employee_number) || '不明'}）`,
        source_refs: [...new Set(state.pages.map((x) => x.file))].map((f) => `設計図書: ${f}`),
      });
      state.checks = SlabGenerator.checkSlabJson(state.json);
      state.params = p;
      renderChecks();
      document.getElementById('ddApply').disabled = !state.checks.ok;
    } catch (e) { alert('生成に失敗: ' + e.message); }
  }

  function renderChecks() {
    const c = document.getElementById('ddChecks');
    if (!c || !state.checks) return;
    const q = state.json.quantities;
    const trs = state.checks.rows.map((r) => `<tr><td>${r.ok ? '✓' : '⚠'}</td><td>${escapeHtml(r.label)}</td><td>${escapeHtml(r.detail)}</td></tr>`).join('');
    c.innerHTML = `<div class="card"><div class="card-header" style="background:${state.checks.ok ? '#eafaf1' : '#fdf2e9'}">検算 — ${state.checks.ok ? '<b style="color:#27ae60">整合OK</b>' : '<b style="color:#e67e22">警告あり</b>'}
      　パネル ${q.panels.total_count}枚（${q.panels.total_area_m2}m²）・セパ ${q.separators.total_count}本</div>
      <div class="card-body"><table>${trs}</table></div></div>`;
  }

  function apply() {
    if (!state.json) return;
    const ta = document.getElementById('jsonInput');
    if (ta) ta.value = JSON.stringify(state.json, null, 2);
    close();
    if (typeof initApp === 'function') initApp(state.json);
  }

  function back() { state.params = null; state.json = null; state.checks = null; renderStep1(); }

  window.DesignDoc = { open, close, run, generate, apply, back };
})();
