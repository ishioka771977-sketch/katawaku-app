// ============================================================
// 型知 KATACHI — 設計書から作成（design-doc.js）
// ============================================================
// 人の操作: ①設計図書PDFを選ぶ → ②AIに読ませる → ③数値を確認 → ④AIの質問に答える／補足・設計変更を書く
//           → ⑤割付を生成して検算 → ⑥型知に読み込む（あとから「続きから」で対話を再開できる）
// 裏の仕事: pdf.jsでテキスト＋候補ページ画像を作る → /api/extract（登録端末のみ）
//           → AIが構造パラメータを読む → /api/refine で代理人と対話して現実に近づける
//           → lib/slab-generator.js が割付を決定的に生成 → 検算 → 型知本体へ
//           やり取りは katachi_sessions / katachi_dialogue に記録、知見は次回のAIに載る
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

  const state = { files: [], pages: [], params: null, json: null, checks: null, mode: 'standard', busy: false,
    sessionId: null, questions: [], dialogue: [], lastMeta: {}, lastRefine: null,
    projects: [], projectId: '', projectName: '', docs: { files: [], fileforce_url: null }, docsMsg: '' };

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
      <p style="margin-top:0">工事を選ぶと、登録済みの設計図書でそのままAIが読み取ります。未登録なら FileForce からダウンロードして一度登録すれば、次から誰でも「工事を選ぶ」だけです。<br>
      読み取ったあと、AIの質問に答えたり現場の実態・設計変更を書き足すと、精度が現実に近づきます（やり取りは記録され、次の現場に生かされます）。</p>
      <div class="card"><div class="card-header">① 工事を選ぶ</div><div class="card-body">
        <select id="ddProject" style="font-size:14px;max-width:100%"><option value="">読み込み中…</option></select>
        <div id="ddDocs" style="margin-top:10px;color:#666">工事を選ぶと設計図書の状況が出ます。</div>
      </div></div>
      <div class="card"><div class="card-header">② AIに読ませるページ</div><div class="card-body">
        <div id="ddScan" style="color:#666"></div>
        <div id="ddPages" style="color:#888">設計図書を読み込むと候補ページを自動で選びます（一般図・床版図・断面図）。</div>
      </div></div>
      <div class="card"><div class="card-header">③ 読み取りモード</div><div class="card-body">
        <label style="margin-right:16px"><input type="radio" name="ddMode" value="standard" ${state.mode === 'standard' ? 'checked' : ''}> 標準（速い・普段はこちら）</label>
        <label><input type="radio" name="ddMode" value="precise" ${state.mode === 'precise' ? 'checked' : ''}> 精密（時間がかかる・複雑な図面向け）</label>
        <div style="margin-top:6px;color:#666;font-size:12px">工事名の手がかり（任意）: <input id="ddHint" type="text" style="width:60%;font-size:13px" placeholder="例: 宿野辺橋床版工事（合成床版）"></div>
      </div></div>
      <div class="btn-group" style="margin-top:8px">
        <button class="btn btn-primary" id="ddRun" disabled onclick="DesignDoc.run()">AIに読ませる</button>
        <span id="ddStatus" style="margin-left:10px;color:#666"></span>
      </div>
      <div class="card" style="margin-top:16px"><div class="card-header">続きから（前に読み取った工事の対話を再開）</div><div class="card-body" id="ddSessions" style="color:#888">読み込み中…</div></div>`;
    b.querySelectorAll('input[name=ddMode]').forEach((r) => r.addEventListener('change', (e) => { state.mode = e.target.value; }));
    document.getElementById('ddProject').addEventListener('change', (e) => selectProject(e.target.value));
    loadProjects();
    loadSessionList();
  }

  async function loadProjects() {
    const sel = document.getElementById('ddProject');
    try {
      const res = await fetch('/api/projects', { headers: sessionHeaders() });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      state.projects = data.projects || [];
      const years = [...new Set(state.projects.map((p) => p.fiscal_year))].sort((a, b) => b - a);
      sel.innerHTML = `<option value="">— 工事を選ぶ —</option>` + years.map((y) => `<optgroup label="R${y - 2018}年度（${y}）">` +
        state.projects.filter((p) => p.fiscal_year === y).map((p) => `<option value="${p.id}" ${String(p.id) === String(state.projectId) ? 'selected' : ''}>${escapeHtml(p.project_name)}${p.docs.count ? `　📄${p.docs.count}` : ''}</option>`).join('') + `</optgroup>`).join('') +
        `<option value="__manual">（一覧にない工事・自分でPDFを選ぶ）</option>`;
      if (state.projectId) selectProject(state.projectId);
    } catch (e) {
      sel.innerHTML = `<option value="">工事一覧を取得できません（${escapeHtml(e.message)}）</option><option value="__manual">自分でPDFを選ぶ</option>`;
    }
  }

  async function selectProject(id) {
    const box = document.getElementById('ddDocs');
    state.pages = []; state.projectId = id === '__manual' ? '' : id;
    const p = state.projects.find((x) => String(x.id) === String(id));
    state.projectName = p ? p.project_name : '';
    const hint = document.getElementById('ddHint'); if (hint) hint.value = state.projectName;
    document.getElementById('ddRun').disabled = true;
    if (!id) { box.innerHTML = '工事を選ぶと設計図書の状況が出ます。'; return; }
    if (id === '__manual') { box.innerHTML = manualPickerHtml(); bindManualPicker(); return; }
    box.textContent = '設計図書を確認しています…';
    try {
      const res = await fetch('/api/design-docs?project_id=' + encodeURIComponent(id), { headers: sessionHeaders() });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      state.docs = { files: data.files || [], fileforce_url: data.fileforce_url || null };
      renderDocs();
    } catch (e) { box.innerHTML = `<span style="color:#c0392b">設計図書の確認に失敗: ${escapeHtml(e.message)}</span>` + manualPickerHtml(); bindManualPicker(); }
  }

  function manualPickerHtml() {
    return `<div style="margin-top:8px"><label class="btn btn-warning" style="cursor:pointer">📂 自分でPDFを選ぶ<input type="file" id="ddFiles" accept="application/pdf" multiple style="display:none"></label>
      <span style="color:#666;font-size:12px;margin-left:8px">複数選択OK。図面PDF（fig）は必ず含めてください。</span></div>`;
  }
  function bindManualPicker() { const inp = document.getElementById('ddFiles'); if (inp) inp.addEventListener('change', (e) => loadFiles([...e.target.files])); }

  function renderDocs() {
    const box = document.getElementById('ddDocs');
    const d = state.docs;
    const ff = d.fileforce_url || 'https://app2.fileforce.jp/f/';
    const list = d.files.length
      ? `<ul style="margin:6px 0;padding-left:18px">${d.files.map((f) => `<li>${escapeHtml(f.name)} <span style="color:#888;font-size:12px">${f.size ? (f.size / 1024 / 1024).toFixed(1) + 'MB・' : ''}${(f.updated_at || '').slice(0, 10)}</span> <a href="#" onclick="DesignDoc.deleteDoc('${escapeHtml(f.name)}');return false" style="color:#c0392b;font-size:12px;margin-left:6px">削除</a></li>`).join('')}</ul>`
      : `<div style="color:#e67e22;margin:6px 0">この工事の設計図書はまだ登録されていません。</div>`;
    box.innerHTML = `
      <div><b>${escapeHtml(state.projectName)}</b> — 登録済み設計図書 ${d.files.length}件</div>${list}
      <div class="btn-group" style="margin-top:6px;flex-wrap:wrap">
        ${d.files.length ? `<button class="btn btn-primary" onclick="DesignDoc.useStoredDocs()">📄 この設計図書で読み取る</button>` : ''}
        <label class="btn btn-success" style="cursor:pointer">⬆ 設計図書を登録する（PDFを選ぶ）<input type="file" id="ddUpload" accept="application/pdf" multiple style="display:none"></label>
        <a class="btn" href="${escapeHtml(ff)}" target="_blank" rel="noopener" style="background:#34495e;color:#fff">🗂 FileForceを開く</a>
        <label class="btn btn-warning" style="cursor:pointer">📂 自分でPDFを選ぶ（登録しない）<input type="file" id="ddFiles" accept="application/pdf" multiple style="display:none"></label>
      </div>
      <div style="margin-top:6px;font-size:12px;color:#666">FileForceの場所: <input id="ddFfUrl" type="text" value="${escapeHtml(d.fileforce_url || '')}" placeholder="app2.fileforce.jp/f/#folder/… を貼ると次から直接開けます" style="width:60%;font-size:12px"> <button class="btn btn-sm" onclick="DesignDoc.saveFfUrl()">保存</button></div>
      <div id="ddDocsMsg" style="margin-top:4px;color:#666;font-size:12px">${escapeHtml(state.docsMsg || '')}</div>`;
    document.getElementById('ddUpload').addEventListener('change', (e) => uploadDocs([...e.target.files]));
    bindManualPicker();
  }

  async function uploadDocs(files) {
    files = files.filter((f) => /\.pdf$/i.test(f.name));
    if (!files.length || !state.projectId) return;
    const msg = document.getElementById('ddDocsMsg');
    try {
      for (let i = 0; i < files.length; i++) {
        msg.textContent = `登録中 ${i + 1}/${files.length}: ${files[i].name}`;
        const r = await fetch('/api/design-docs', { method: 'POST', headers: sessionHeaders(), body: JSON.stringify({ project_id: state.projectId, filename: files[i].name }) });
        const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
        const put = await fetch(d.signedUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'true' }, body: files[i] });
        if (!put.ok) throw new Error(`${files[i].name} の保存に失敗（${put.status}）`);
      }
      state.docsMsg = `${files.length}件を登録しました。次からは「この設計図書で読み取る」だけです。`;
      await selectProject(state.projectId);
    } catch (e) { msg.textContent = '登録に失敗: ' + e.message; }
  }

  async function deleteDoc(name) {
    if (!confirm(`${name} を登録から外しますか？`)) return;
    try {
      const r = await fetch('/api/design-docs?project_id=' + encodeURIComponent(state.projectId) + '&name=' + encodeURIComponent(name), { method: 'DELETE', headers: sessionHeaders() });
      const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      state.docsMsg = `${name} を外しました。`;
      await selectProject(state.projectId);
    } catch (e) { alert('削除に失敗: ' + e.message); }
  }

  async function saveFfUrl() {
    const url = (document.getElementById('ddFfUrl') || {}).value || '';
    try {
      const r = await fetch('/api/design-docs', { method: 'POST', headers: sessionHeaders(), body: JSON.stringify({ project_id: state.projectId, meta: { fileforce_url: url.trim() } }) });
      const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      state.docs.fileforce_url = url.trim(); state.docsMsg = 'FileForceの場所を保存しました。'; renderDocs();
    } catch (e) { alert('保存に失敗: ' + e.message); }
  }

  // 登録済み設計図書を取り寄せて pdf.js に渡す
  async function useStoredDocs() {
    const scan = document.getElementById('ddScan');
    const files = [];
    try {
      for (let i = 0; i < state.docs.files.length; i++) {
        const f = state.docs.files[i];
        scan.textContent = `設計図書を取り寄せ中 ${i + 1}/${state.docs.files.length}: ${f.name}`;
        const r = await fetch(f.url);
        if (!r.ok) throw new Error(`${f.name} の取得に失敗（${r.status}）`);
        files.push(new File([await r.blob()], f.name, { type: 'application/pdf' }));
      }
    } catch (e) { scan.textContent = '取り寄せに失敗: ' + e.message; return; }
    await loadFiles(files);
  }

  // PDF群 → ページ走査 → 候補ページ自動選択（登録済み／手選択 共通）
  async function loadFiles(files) {
    files = files.filter((f) => /\.pdf$/i.test(f.name));
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
    const cand = autoSelectPages(state.pages);
    cand.slice(0, MAX_IMAGES).forEach((p) => { p.selected = true; });
    scan.textContent = `${files.length}ファイル・${state.pages.length}ページ。候補 ${Math.min(cand.length, MAX_IMAGES)} ページを自動選択しました（変更できます）。`;
    await renderPageList();
    document.getElementById('ddRun').disabled = false;
  }

  async function loadSessionList() {
    const box = document.getElementById('ddSessions');
    if (!box) return;
    try {
      const res = await fetch('/api/sessions', { headers: sessionHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (!data.sessions.length) { box.textContent = data.warning ? `記録はまだ使えません（${data.warning}）` : 'まだありません。'; return; }
      box.innerHTML = data.sessions.map((s) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #eee">
          <div><b>${escapeHtml(s.project_name)}</b> <span style="color:#666;font-size:12px">${escapeHtml(s.structure_name || '')}・${escapeHtml(s.employee_number || '')}・対話${s.round_count}回・${(s.updated_at || '').slice(0, 10)}${s.status === 'closed' ? '・完了' : ''}</span></div>
          <button class="btn btn-sm btn-primary" onclick="DesignDoc.resume('${s.id}')">続きから</button>
        </div>`).join('');
    } catch (e) {
      box.innerHTML = `<span style="color:#999">一覧を取得できません（${escapeHtml(e.message)}）</span>`;
    }
  }

  async function resume(id) {
    const status = document.getElementById('ddSessions');
    if (status) status.textContent = '読み込み中…';
    try {
      const res = await fetch('/api/sessions?id=' + encodeURIComponent(id), { headers: sessionHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const s = data.session;
      state.sessionId = s.id;
      state.params = s.params_current || s.params_initial;
      state.json = s.json_current || null;
      state.checks = state.json ? SlabGenerator.checkSlabJson(state.json) : null;
      state.mode = s.mode || 'standard';
      state.dialogue = data.dialogue || [];
      // 未回答の質問＝最後のAIの質問群（回答が付いていないもの）
      const answered = new Set(state.dialogue.filter((d) => d.kind === 'answer' && d.ref_seq).map((d) => d.ref_seq));
      state.questions = state.dialogue.filter((d) => d.kind === 'question' && !answered.has(d.seq)).map((d) => ({ seq: d.seq, question: d.content }));
      state.lastMeta = { model: '', resumed: true };
      state.lastRefine = null;
      renderStep2();
    } catch (e) { alert('再開に失敗: ' + e.message); }
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
        project_hint: (document.getElementById('ddHint') || {}).value || state.projectName || '',
        project_id: state.projectId || null,
      };
      const res = await fetch('/api/extract', { method: 'POST', headers: sessionHeaders(), body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      state.params = data.params; state.json = data.json; state.checks = data.checks;
      state.sessionId = data.session_id || null;
      state.questions = data.questions || (data.params.questions || []).map((q) => ({ seq: null, question: q }));
      state.dialogue = [];
      state.lastRefine = null;
      state.lastMeta = { model: data.model, usage: data.usage, missing: data.missing, gen_error: data.gen_error, warning: data.warning, lessons_used: data.lessons_used };
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
    ['scope_end', "妻型枠 A/A'（橋軸方向端部）", 'scope'], ['scope_side', "側型枠 B/B'（張出し端）", 'scope'],
  ];
  const SCOPE_OPTIONS = [['plywood', 'コンパネで割付する'], ['steel_existing', '鋼製型枠が施工済み（コンパネ不要）'], ['none', '型枠不要']];

  function evidenceFor(field) {
    const ev = (state.params && state.params.evidence) || [];
    return ev.filter((e) => e.field === field || e.field.startsWith(field + '.'));
  }

  function renderStep2() {
    const b = document.getElementById('ddBody');
    const p = state.params;
    const bp = p.base_plate || {};
    const conf = Math.round((p.confidence || 0) * 100);
    const scope = p.formwork_scope || {};
    const rows = FIELDS.map(([k, label, type]) => {
      const v = k === 'scope_end' ? (scope.end_forms || 'plywood') : k === 'scope_side' ? (scope.side_forms || 'plywood') : p[k];
      const ev = evidenceFor(k);
      const evHtml = ev.map((e) => `<div style="color:#666;font-size:11px">根拠: ${escapeHtml(e.source)}（${Math.round((e.confidence || 0) * 100)}%）</div>`).join('');
      let input;
      if (type === 'select') input = `<select data-k="${k}"><option value="composite_steel_deck" ${v === 'composite_steel_deck' ? 'selected' : ''}>合成床版（底鋼板あり）</option><option value="rc_slab" ${v === 'rc_slab' ? 'selected' : ''}>RC床版</option><option value="pc_slab" ${v === 'pc_slab' ? 'selected' : ''}>PC床版</option></select>`;
      else if (type === 'scope') input = `<select data-k="${k}">${SCOPE_OPTIONS.map(([val, lab]) => `<option value="${val}" ${v === val ? 'selected' : ''}>${lab}</option>`).join('')}</select>`;
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
    const notes = (p.extra_notes || []).map((n) => `<li><b>${escapeHtml(n.category)}</b>: ${escapeHtml(n.content)}</li>`).join('');
    const meta = state.lastMeta || {};
    const recNote = state.sessionId ? `<span style="color:#27ae60">記録中</span>` : `<span style="color:#e67e22">未記録（${escapeHtml(meta.warning || 'セッション表が未作成')}）</span>`;
    b.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <b>④ 読み取り結果を確認（AIの確信度 ${conf}%）</b>
        <span style="color:#666;font-size:12px">${escapeHtml(meta.model || '')} ／ 対話 ${recNote}${meta.lessons_used ? `・過去の知見${meta.lessons_used}件を参照` : ''}</span>
      </div>
      <div class="card" style="margin-top:8px"><div class="card-header">構造パラメータ（直せます）</div><div class="card-body">
        <table style="width:100%">${rows}${bpRows}</table>
      </div></div>
      <div id="ddRefineResult"></div>
      <div class="card"><div class="card-header" style="background:#fdf2e9">AIから代理人への確認事項 — 答えると精度が現実に近づきます</div><div class="card-body" id="ddQA"></div></div>
      ${notes ? `<div class="card"><div class="card-header">設計書からの申し送り（notesに入ります）</div><div class="card-body"><ul style="margin:0;padding-left:18px">${notes}</ul></div></div>` : ''}
      <div id="ddChecks"></div>
      <div class="btn-group" style="margin-top:8px">
        <button class="btn btn-primary" onclick="DesignDoc.generate()">⑤ 割付を生成して検算</button>
        <button class="btn btn-success" id="ddApply" ${state.json ? '' : 'disabled'} onclick="DesignDoc.apply()">⑥ 型知に読み込む</button>
        <button class="btn" onclick="DesignDoc.toggleLog()">対話の記録 ${state.dialogue.length ? `(${state.dialogue.length})` : ''}</button>
        <button class="btn" onclick="DesignDoc.back()">← やり直す</button>
      </div>
      <div id="ddLog" style="display:none"></div>`;
    renderQA();
    if (state.checks) renderChecks();
  }

  // 質問への回答＋補足・設計変更の入力欄
  function renderQA() {
    const box = document.getElementById('ddQA');
    if (!box) return;
    const qs = state.questions || [];
    const qHtml = qs.length ? qs.map((q, i) => `
      <div style="margin-bottom:10px">
        <div><b>Q${i + 1}.</b> ${escapeHtml(q.question)}</div>
        <textarea data-q="${i}" rows="2" style="width:100%;font-size:13px;margin-top:3px" placeholder="現場の実態を短く（わからなければ空でOK）"></textarea>
      </div>`).join('') : `<div style="color:#27ae60;margin-bottom:8px">AIからの質問はありません。</div>`;
    box.innerHTML = `${qHtml}
      <div style="margin-top:6px"><b>補足（設計書に無い現場の実態・代理人の知っていること）</b>
        <textarea id="ddRemark" rows="2" style="width:100%;font-size:13px;margin-top:3px" placeholder="例: 端部の鋼製型枠は施工済みなので妻型枠は不要。地覆側の張出は現場合わせ"></textarea></div>
      <div style="margin-top:6px"><b>設計変更（あれば）</b>
        <textarea id="ddChange" rows="2" style="width:100%;font-size:13px;margin-top:3px" placeholder="例: 第1回変更で幅員が21,500→21,900に拡幅"></textarea></div>
      <div class="btn-group" style="margin-top:8px">
        <button class="btn btn-warning" id="ddRefine" onclick="DesignDoc.refine()">答えてAIに反映する</button>
        <span id="ddRefineStatus" style="margin-left:10px;color:#666"></span>
      </div>`;
  }

  async function refine() {
    if (state.busy) return;
    const box = document.getElementById('ddQA');
    const answers = [...box.querySelectorAll('textarea[data-q]')].map((t) => ({ ...state.questions[Number(t.dataset.q)], answer: t.value.trim() })).filter((a) => a.answer)
      .map((a) => ({ ref_seq: a.seq, question: a.question, answer: a.answer }));
    const remark = document.getElementById('ddRemark').value.trim();
    const change = document.getElementById('ddChange').value.trim();
    if (!answers.length && !remark && !change) { alert('回答か補足を1つ以上入れてください'); return; }
    const status = document.getElementById('ddRefineStatus');
    const btn = document.getElementById('ddRefine');
    state.busy = true; btn.disabled = true;
    status.textContent = 'AIが反映しています… 30秒〜1分';
    try {
      const res = await fetch('/api/refine', { method: 'POST', headers: sessionHeaders(), body: JSON.stringify({
        session_id: state.sessionId, mode: state.mode, structure_type: 'deck_slab', params: collectParams(),
        answers, remarks: remark ? [remark] : [], change_requests: change ? [change] : [],
      }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      // evidence は初回のものを保持
      state.params = { ...state.params, ...data.params, evidence: state.params.evidence };
      state.json = data.json; state.checks = data.checks;
      state.questions = (data.follow_up_questions || []).map((q) => ({ seq: null, question: q }));
      // 記録済みなら seq 付きの質問に差し替える
      if (Array.isArray(data.dialogue) && data.dialogue.length) {
        state.dialogue = data.dialogue;
        const lastSummaryIdx = [...data.dialogue].reverse().findIndex((d) => d.kind === 'summary');
        const afterSeq = lastSummaryIdx >= 0 ? data.dialogue[data.dialogue.length - 1 - lastSummaryIdx].seq : 0;
        state.questions = data.dialogue.filter((d) => d.kind === 'question' && d.seq > afterSeq).map((d) => ({ seq: d.seq, question: d.content }));
      }
      state.lastRefine = data;
      state.lastMeta = { ...state.lastMeta, model: data.model, warning: data.warning };
      renderStep2();
      renderRefineResult();
    } catch (e) {
      status.textContent = '失敗: ' + e.message;
      btn.disabled = false;
    } finally { state.busy = false; }
  }

  function renderRefineResult() {
    const c = document.getElementById('ddRefineResult');
    const r = state.lastRefine;
    if (!c || !r) return;
    const ch = (r.changes || []).length
      ? `<table style="width:100%">${r.changes.map((x) => `<tr><td style="white-space:nowrap"><b>${escapeHtml(x.field)}</b></td><td>${escapeHtml(x.old_value)} → <b>${escapeHtml(x.new_value)}</b></td><td style="color:#666">${escapeHtml(x.reason)}</td></tr>`).join('')}</table>`
      : `<div style="color:#666">パラメータの変更はありません。</div>`;
    const ls = (r.lessons || []).length ? `<div style="margin-top:6px;color:#2c3e50"><b>次の現場に残す知見（${r.lessons_saved || 0}件記録）</b><ul style="margin:2px 0 0;padding-left:18px">${r.lessons.map((l) => `<li>[${escapeHtml(l.category)}] ${escapeHtml(l.title)}: ${escapeHtml(l.content)}</li>`).join('')}</ul></div>` : '';
    c.innerHTML = `<div class="card"><div class="card-header" style="background:#eaf2fb">AIの反映結果（${r.round ? `対話${r.round}回目` : '未記録'}）</div><div class="card-body">
      <div style="margin-bottom:6px">${escapeHtml(r.summary || '')}</div>${ch}${ls}
      ${r.warning ? `<div style="color:#e67e22;font-size:12px;margin-top:4px">⚠ ${escapeHtml(r.warning)}</div>` : ''}
    </div></div>`;
  }

  function toggleLog() {
    const box = document.getElementById('ddLog');
    if (!box) return;
    if (box.style.display === 'none') {
      const rows = state.dialogue.length ? state.dialogue.map((d) => `<tr><td style="white-space:nowrap;color:#888">${d.seq}</td><td style="white-space:nowrap">${d.role === 'ai' ? '🤖 AI' : '👷 代理人'}<br><span style="font-size:11px;color:#888">${escapeHtml(d.kind)}</span></td><td style="white-space:pre-wrap">${escapeHtml(d.content)}</td></tr>`).join('') : '<tr><td colspan="3" style="color:#888">記録はまだありません（セッション表が未作成か、対話がまだです）</td></tr>';
      box.innerHTML = `<div class="card" style="margin-top:8px"><div class="card-header">対話の記録（この工事）</div><div class="card-body"><table style="width:100%;font-size:12px">${rows}</table></div></div>`;
      box.style.display = 'block';
    } else box.style.display = 'none';
  }

  function collectParams() {
    const b = document.getElementById('ddBody');
    const p = { ...state.params };
    b.querySelectorAll('[data-k]').forEach((inp) => {
      const k = inp.dataset.k;
      if (k === 'bp_exists' || k === 'bp_thickness' || k === 'bp_material' || k === 'scope_end' || k === 'scope_side') return;
      if (inp.type === 'number') p[k] = inp.value === '' ? null : Number(inp.value);
      else p[k] = inp.value;
    });
    p.base_plate = {
      exists: b.querySelector('[data-k=bp_exists]').checked,
      thickness_mm: b.querySelector('[data-k=bp_thickness]').value === '' ? null : Number(b.querySelector('[data-k=bp_thickness]').value),
      material: b.querySelector('[data-k=bp_material]').value || null,
    };
    if (!p.skew_direction) p.skew_direction = 'none';
    p.formwork_scope = { end_forms: b.querySelector('[data-k=scope_end]').value, side_forms: b.querySelector('[data-k=scope_side]').value };
    return p;
  }

  function generate() {
    const p = collectParams();
    const missing = SlabGenerator.validateParams(p);
    if (missing.length) { alert('入力が足りません: ' + missing.join(', ')); return; }
    try {
      const u = (typeof getLoggedInUser === 'function') ? getLoggedInUser() : null;
      state.json = SlabGenerator.generateSlabJson({
        ...p, skew_direction: p.skew_direction === 'none' ? null : p.skew_direction,
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

  async function apply() {
    if (!state.json) return;
    const ta = document.getElementById('jsonInput');
    if (ta) ta.value = JSON.stringify(state.json, null, 2);
    // 型知に読み込んだ最終JSONをセッションに保存（失敗しても進める）
    if (state.sessionId) {
      fetch('/api/sessions', { method: 'POST', headers: sessionHeaders(), body: JSON.stringify({ id: state.sessionId, json: state.json, params: state.params }) }).catch(() => {});
    }
    close();
    if (typeof initApp === 'function') initApp(state.json);
  }

  function back() { state.params = null; state.json = null; state.checks = null; state.sessionId = null; state.questions = []; state.dialogue = []; state.lastRefine = null; state.pages = []; renderStep1(); }

  window.DesignDoc = { open, close, run, generate, apply, back, refine, resume, toggleLog, useStoredDocs, deleteDoc, saveFfUrl };
})();
