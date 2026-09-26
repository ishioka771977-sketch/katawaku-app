// ============================================================
// 型知「FileForceから取り込む」ブックマークレット本体（FileForce Web の画面で動く）
//   使い方: FileForce（app2.fileforce.jp/f/）で工事フォルダを開き、ブックマークバーの
//           「型知に取り込む」を押す → この画面に窓が出る → 工事を選んで「型知に登録」
//   仕組み: ログイン済みのブラウザが FileForce の画面用API（folder/getfiles・file/actions）で
//           PDF を取り、型知の小窓（ff-bridge.html・型知の端末認証）経由で設計図書置き場へ保存する。
//           FileForce の鍵・仕様書は不要。鉄知とも設計図書は共有。
//   ブックマークの中身（型知の画面からドラッグして登録）:
//     javascript:(function(){window.__ktBridge=window.open('https://katachi-mu.vercel.app/ff-bridge.html','kt_bridge','width=460,height=380');
//       var s=document.createElement('script');s.src='https://katachi-mu.vercel.app/ff-import.js?'+Date.now();document.body.appendChild(s)})()
// ============================================================
(function () {
  'use strict';
  var SELF = (document.currentScript && document.currentScript.src) || 'https://katachi-mu.vercel.app/ff-import.js';
  var KT_ORIGIN = SELF.replace(/\/ff-import\.js.*$/, '');
  var FF_ORIGIN = 'https://app2.fileforce.jp';

  var old = document.getElementById('kt-ff-overlay'); if (old) old.remove();
  if (location.origin !== FF_ORIGIN || !window.$ || !$.bazajax || !$.bazajax.options) {
    alert('FileForce のファイル画面（app2.fileforce.jp/f/）で工事フォルダを開いてから押してください');
    return;
  }
  var o = $.bazajax.options;
  var bridge = window.__ktBridge || null;

  // ---------- FileForce 画面用API ----------
  function api(name, body) {
    var payload = { AppKey: o.app_key, BazaId: o.baza_id };
    for (var k in body) payload[k] = body[k];
    return fetch(o.json_url + name, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.text(); })
      .then(function (t) { var j; try { j = JSON.parse(t); } catch (e) { throw new Error(name + ' の応答が読めません'); } if (j.error) throw new Error(j.message || name + ' に失敗'); return j; });
  }
  function currentFolderId() {
    var m = location.hash.match(/#folder\/([0-9a-zA-Z_]+)/);
    if (m) return m[1];
    var dz = document.querySelector('[data-folder]');
    return dz ? dz.getAttribute('data-folder') : 'BAZA_ROOT';
  }
  function downloadKey() {
    var m = document.documentElement.outerHTML.match(/addon_key_download:\s*'([0-9a-f-]{36})'/);
    return m ? m[1] : null;
  }
  async function listFiles(folderId) {
    var all = [], page = 1;
    for (;;) {
      var r = await api('folder/getfiles', { FolderId: folderId, Page: page, Size: 100, Sort: 'name', Order: 'asc', Viewtype: 0, ImageSize: 0, IsAttributes: false });
      var files = r.files || [];
      all = all.concat(files);
      if (!files.length || files.length < 100 || page >= 10) break;
      page++;
    }
    return all;
  }
  async function downloadUrls(fileIds) {
    var key = downloadKey();
    var r = await api('file/actions', { FileIds: fileIds });
    var map = {};
    (r.actions || []).forEach(function (row) {
      var list = row.Value || row.value || [];
      var hit = null;
      for (var i = 0; i < list.length; i++) {
        var a = list[i];
        if (key ? a.key === key : (/ダウンロード/.test(a.name || '') && !/ZIP|zip|一括/.test(a.name || ''))) { hit = a; break; }
      }
      if (hit && hit.url) map[row.Key || row.key] = hit.url;
    });
    return map;
  }

  // ---------- 型知の小窓（ff-bridge.html）との通信 ----------
  var seq = 0, pending = {};
  window.addEventListener('message', function (ev) {
    if (ev.origin !== KT_ORIGIN) return;
    var m = ev.data || {};
    if (m.type === 'ready') { bridgeReady = true; bridgeUser = m; if (readyResolve) readyResolve(m); return; }
    if (m.id && pending[m.id]) { var p = pending[m.id]; delete pending[m.id]; m.ok ? p.resolve(m.res) : p.reject(new Error(m.error || '型知との通信に失敗')); }
  });
  var bridgeReady = false, bridgeUser = null, readyResolve = null;
  function waitBridge() {
    if (!bridge || bridge.closed) return Promise.reject(new Error('型知の小窓が開けませんでした。ポップアップを許可してからもう一度押してください'));
    if (bridgeReady) return Promise.resolve(bridgeUser);
    return new Promise(function (res, rej) {
      readyResolve = res;
      var n = 0; var t = setInterval(function () {
        if (bridgeReady) { clearInterval(t); return; }
        if (bridge.closed) { clearInterval(t); rej(new Error('型知の小窓が閉じられました')); return; }
        try { bridge.postMessage({ type: 'hello' }, KT_ORIGIN); } catch (e) {}
        if (++n > 60) { clearInterval(t); rej(new Error('型知の小窓が応答しません（型知にログインしていますか？）')); }
      }, 500);
    });
  }
  function call(msg) {
    return waitBridge().then(function () {
      return new Promise(function (resolve, reject) {
        var id = 'kt' + (++seq) + '_' + Date.now();
        pending[id] = { resolve: resolve, reject: reject };
        msg.id = id;
        bridge.postMessage(msg, KT_ORIGIN);
        setTimeout(function () { if (pending[id]) { delete pending[id]; reject(new Error('型知の応答待ちが長すぎます')); } }, 180000);
      });
    });
  }

  // ---------- 工事の自動候補（フォルダ名と工事名の共通部分） ----------
  function norm(s) { return String(s || '').replace(/^[\d０-９.\-_\s◎○〇【】\[\]]+/, '').replace(/[\s　]/g, ''); }
  var STOP = ['工事', '年度', '地区', '線外', '橋梁', '修繕', '維持', '一般', '国道', '町道', '道路', '補修', '関係', '契約', '入札', '設計', '図面'];
  function lcs(a, b) { // 最長共通部分文字列（長さと文字列）
    var best = 0, end = 0, prev = [];
    for (var i = 0; i < a.length; i++) { var cur = []; for (var j = 0; j < b.length; j++) { cur[j] = a[i] === b[j] ? ((prev[j - 1] || 0) + 1) : 0; if (cur[j] > best) { best = cur[j]; end = i + 1; } } prev = cur; }
    return { len: best, str: a.slice(end - best, end) };
  }
  function guessProject(pathSegs, projects) { // 「宿野部」→「宿野辺橋…」のように2文字でも固有の語なら当てる（工事・年度などの一般語は除く）
    var best = null, score = 0;
    projects.forEach(function (p) {
      var pn = norm(p.project_name);
      pathSegs.forEach(function (seg) { var r = lcs(norm(seg), pn); var s = r.len >= 3 ? r.len : (r.len === 2 && STOP.indexOf(r.str) < 0 ? 2 : 0); if (s > score) { score = s; best = p; } });
    });
    return score >= 2 ? best : null;
  }
  // 設計図書らしいファイル（fig/tokki/suuryou/sankou/list・図面・特記・数量）だけ最初からチェック。様式や公告は外す
  function isDesignDoc(name) { return /^(fig|tokki|suuryou|sankou|list)\d*|図面|特記|数量|設計|構造|配筋|一般図|参考/i.test(name || ''); }

  // ---------- 画面 ----------
  var css = 'position:fixed;top:24px;right:24px;width:520px;max-height:85vh;overflow:auto;background:#fff;color:#222;z-index:2147483000;box-shadow:0 8px 32px rgba(0,0,0,.35);border-radius:10px;font:14px/1.6 -apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic",Meiryo,sans-serif;';
  var box = document.createElement('div'); box.id = 'kt-ff-overlay'; box.setAttribute('style', css);
  box.innerHTML = '<div style="background:#2c3e50;color:#fff;padding:10px 14px;border-radius:10px 10px 0 0;display:flex;justify-content:space-between;align-items:center"><b>📐 型知に取り込む</b><a href="#" id="ktClose" style="color:#fff;text-decoration:none;font-size:18px">✕</a></div>' +
    '<div style="padding:12px 14px" id="ktBody">読み込み中…</div>';
  document.body.appendChild(box);
  var body = box.querySelector('#ktBody');
  box.querySelector('#ktClose').onclick = function (e) { e.preventDefault(); box.remove(); if (bridge && !bridge.closed) bridge.close(); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fail(msg) { body.innerHTML = '<div style="color:#c0392b;white-space:pre-wrap">' + esc(msg) + '</div><div style="margin-top:8px;font-size:12px;color:#666">型知: <a href="' + KT_ORIGIN + '" target="_blank">' + KT_ORIGIN + '</a></div>'; }

  (async function main() {
    var folderId = currentFolderId();
    var info = null, pathSegs = [];
    try { var gi = await api('folder/getinfo', { FolderId: folderId }); info = gi.folder || gi.info || gi; pathSegs = (info.patharray || String(info.fullpath || '').split('/')).map(function (x) { return typeof x === 'string' ? x : (x && x.name) || ''; }).filter(Boolean); } catch (e) {}
    var files = [];
    try { files = await listFiles(folderId); } catch (e) { return fail('フォルダ内の一覧を取得できません: ' + e.message); }
    var pdfs = files.filter(function (f) { return /\.pdf$/i.test(f.name || ''); });
    var others = files.length - pdfs.length;
    var user;
    try { user = await waitBridge(); } catch (e) { return fail(e.message); }
    if (!user.logged_in) return fail('型知にログインしていません。型知を開いてログインしてから、もう一度ブックマークを押してください。');
    var projects = [];
    try { projects = (await call({ type: 'projects' })).projects || []; } catch (e) { return fail('工事一覧を取得できません: ' + e.message); }
    var guess = guessProject(pathSegs, projects);
    var years = []; projects.forEach(function (p) { if (years.indexOf(p.fiscal_year) < 0) years.push(p.fiscal_year); }); years.sort(function (a, b) { return b - a; });
    var opts = '<option value="">— 工事を選ぶ —</option>' + years.map(function (y) {
      return '<optgroup label="R' + (y - 2018) + '年度">' + projects.filter(function (p) { return p.fiscal_year === y; }).map(function (p) {
        return '<option value="' + esc(p.id) + '"' + (guess && p.id === guess.id ? ' selected' : '') + '>' + esc(p.project_name) + (p.docs && p.docs.count ? '　📄' + p.docs.count : '') + '</option>';
      }).join('') + '</optgroup>';
    }).join('');
    body.innerHTML =
      '<div style="font-size:12px;color:#666;margin-bottom:6px">フォルダ: ' + esc(pathSegs.join(' / ') || folderId) + '</div>' +
      '<div style="margin-bottom:8px">① 工事: <select id="ktProject" style="font-size:14px;max-width:360px">' + opts + '</select>' + (guess ? ' <span style="font-size:12px;color:#27ae60">← フォルダ名から推定</span>' : '') + '</div>' +
      '<div>② 取り込む設計図書（PDF ' + pdfs.length + '件' + (others ? '・PDF以外 ' + others + '件は対象外' : '') + '）<span style="font-size:12px;color:#666">　図面・特記・数量らしいものに最初からチェックが入ります</span></div>' +
      '<div style="max-height:34vh;overflow:auto;border:1px solid #ddd;border-radius:6px;padding:6px 8px;margin:4px 0 8px">' +
      (pdfs.length ? pdfs.map(function (f, i) { var big = f.size > 45 * 1024 * 1024; return '<label style="display:block;font-size:13px' + (big ? ';color:#999' : '') + '"><input type="checkbox" class="ktFile" data-i="' + i + '"' + (big ? ' disabled' : (isDesignDoc(f.name) ? ' checked' : '')) + '> ' + esc(f.name) + ' <span style="color:#888;font-size:11px">' + (f.size ? (f.size / 1048576).toFixed(1) + 'MB' : '') + (big ? '（50MB超は対象外）' : '') + '</span></label>'; }).join('') : '<span style="color:#e67e22">このフォルダに PDF がありません。設計図書のあるフォルダ（◎入札契約関係/公告番号 など）を開いてください。</span>') +
      '</div>' +
      '<div style="display:flex;gap:8px;align-items:center"><button id="ktGo" style="background:#27ae60;color:#fff;border:0;border-radius:6px;padding:8px 14px;font-size:14px;cursor:pointer"' + (pdfs.length ? '' : ' disabled') + '>③ 型知に登録する</button><label style="font-size:12px"><input type="checkbox" id="ktAll"> 全部にチェック</label><span style="font-size:12px;color:#666">ログイン: ' + esc(user.employee || '') + '</span></div>' +
      '<div id="ktStatus" style="margin-top:8px;color:#555;white-space:pre-wrap;font-size:13px"></div>';
    body.querySelector('#ktAll').onchange = function (e) { body.querySelectorAll('.ktFile:not([disabled])').forEach(function (c) { c.checked = e.target.checked; }); };
    body.querySelector('#ktGo').onclick = async function () {
      var pid = body.querySelector('#ktProject').value;
      var st = body.querySelector('#ktStatus');
      if (!pid) { st.textContent = '工事を選んでください'; return; }
      var picked = [].slice.call(body.querySelectorAll('.ktFile:checked')).map(function (c) { return pdfs[+c.getAttribute('data-i')]; });
      if (!picked.length) { st.textContent = '取り込むPDFにチェックを入れてください'; return; }
      var btn = this; btn.disabled = true;
      try {
        st.textContent = 'ダウンロード先を確認中…';
        var urls = await downloadUrls(picked.map(function (f) { return f.id; }));
        var done = 0;
        for (var i = 0; i < picked.length; i++) {
          var f = picked[i];
          var url = urls[f.id];
          if (!url) { st.textContent += '\n⚠ ' + f.name + ': ダウンロード権限がありません（飛ばしました）'; continue; }
          st.textContent = '取り込み中 ' + (i + 1) + '/' + picked.length + ': ' + f.name + '（FileForceから取得）';
          var r = await fetch(url);
          if (!r.ok) throw new Error(f.name + ' の取得に失敗（' + r.status + '）');
          var blob = await r.blob();
          st.textContent = '取り込み中 ' + (i + 1) + '/' + picked.length + ': ' + f.name + '（型知へ保存 ' + (blob.size / 1048576).toFixed(1) + 'MB）';
          await call({ type: 'upload', project_id: pid, filename: f.name, blob: blob });
          done++;
        }
        try { await call({ type: 'meta', project_id: pid, meta: { fileforce_url: FF_ORIGIN + '/f/#folder/' + folderId, fileforce_folder: pathSegs.join('/') } }); } catch (e) {}
        var pname = body.querySelector('#ktProject').selectedOptions[0].textContent;
        st.innerHTML = '<b style="color:#27ae60">✅ ' + done + '件を「' + esc(pname) + '」の設計図書として登録しました。</b>\n型知に戻って「📄 この設計図書で読み取る」を押してください（鉄知でも同じ設計図書が使えます）。';
        if (bridge && !bridge.closed) bridge.close();
      } catch (e) { st.textContent = '失敗: ' + e.message; btn.disabled = false; }
    };
  })().catch(function (e) { fail('エラー: ' + e.message); });
})();
