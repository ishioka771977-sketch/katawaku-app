// ============================================================
// 型知 KATACHI — くろたん knowledge-base 連携 (knowledge-base.js)
// ・「くろたんセットアップ」: Supabase Storage → 結合 → クリップボード
// ・「知見を登録」:       ベテラン知見サマリー → field_notes/ に保存
// ============================================================

const KB_BUCKET = 'knowledge-base';

// ── 構造物タイプ → coreファイル群マップ ───────────────
// Supabase Storage は key に日本語不可のため、ファイル名は英数字スラッグ。
// タイトルは表示用に別保持。共通5本 + タイプ固有
const KB_CORE_FILES = {
  _common: [
    { slug: '01_initial_questions.md',  title: '01_初期質問プロトコル' },
    { slug: '02_correct_procedure.md',  title: '02_型枠工事の正しい手順' },
    { slug: '03_plan_writing.md',       title: '03_施工計画書作成の要諦' },
    { slug: '04_cost_principles.md',    title: '04_原価管理の原則' },
    { slug: '08_veteran_glossary.md',   title: '08_ベテラン表現変換辞書' },
  ],
  deck_slab: [
    { slug: '05_slab_knowhow.md', title: '05_床版型枠の知見' },
  ],
  parapet_curb_and_barrier: [
    { slug: '06_parapet_knowhow.md', title: '06_地覆壁高欄の知見' },
    { slug: '10_joint_design.md',    title: '10_誘発目地への設計変更例' },
  ],
  parapet: [
    { slug: '06_parapet_knowhow.md', title: '06_地覆壁高欄の知見' },
    { slug: '10_joint_design.md',    title: '10_誘発目地への設計変更例' },
  ],
  retaining_wall: [
    { slug: '07_wall_knowhow.md', title: '07_擁壁型枠の知見' },
  ],
  abutment: [
    { slug: '09_abutment_knowhow.md', title: '09_橋台型枠の知見' },
  ],
  pier: [],
  box_culvert: [],
  foundation: [],
};

// 構造物タイプ → 日本語ラベル / 英数字スラッグ
const KB_STRUCT_LABEL = {
  deck_slab: '床版',
  parapet: '地覆・壁高欄',
  parapet_curb_and_barrier: '地覆・壁高欄',
  retaining_wall: '擁壁',
  abutment: '橋台',
  pier: '橋脚',
  box_culvert: 'BOX',
  foundation: '基礎',
};
const KB_STRUCT_SLUG = {
  deck_slab: 'slab',
  parapet: 'parapet',
  parapet_curb_and_barrier: 'parapet',
  retaining_wall: 'wall',
  abutment: 'abutment',
  pier: 'pier',
  box_culvert: 'box',
  foundation: 'foundation',
};
// 日本語ラベル（または部分文字列）→ 構造物スラッグ
function kbLabelToSlug(label) {
  const s = (label || '').toLowerCase();
  if (label.includes('床版') || s.includes('slab')) return 'slab';
  if (label.includes('地覆') || label.includes('壁高欄') || s.includes('parapet')) return 'parapet';
  if (label.includes('擁壁') || s.includes('wall')) return 'wall';
  if (label.includes('橋台') || s.includes('abutment')) return 'abutment';
  if (label.includes('橋脚') || s.includes('pier')) return 'pier';
  if (label.toUpperCase().includes('BOX') || label.includes('ボックス') || s.includes('box')) return 'box';
  if (label.includes('基礎') || label.includes('フーチング') || s.includes('foundation')) return 'foundation';
  return 'other';
}

// ── Supabase Client ───────────────────────────────
function kbGetSb() {
  if (window.getSb) return window.getSb();
  console.error('[kb] Supabase client 未初期化');
  return null;
}

async function kbDownloadText(path) {
  const sb = kbGetSb();
  if (!sb) return null;
  const { data, error } = await sb.storage.from(KB_BUCKET).download(path);
  if (error) {
    console.warn('[kb] download failed:', path, error.message);
    return null;
  }
  return await data.text();
}

async function kbListFieldNotesForType(structType) {
  const sb = kbGetSb();
  if (!sb) return [];
  const { data, error } = await sb.storage.from(KB_BUCKET).list('field_notes', {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  });
  if (error || !data) {
    if (error) console.warn('[kb] list field_notes failed:', error.message);
    return [];
  }
  const slug = KB_STRUCT_SLUG[structType] || '';
  // ファイル名規約: {日付}_{作成者slug}_{構造物slug}_{ts}.md
  return data.filter(f =>
    f.name && f.name.toLowerCase().endsWith('.md')
    && f.name !== '.placeholder'
    && (!slug || f.name.includes(`_${slug}_`))
  );
}

// 現在扱っている構造物タイプを推定する
// 優先: appData.structure.type → セレクタ → 既定(床版)
function kbCurrentStructType() {
  try {
    if (typeof appData !== 'undefined' && appData?.structure?.type) {
      return appData.structure.type;
    }
  } catch {}
  const sel = document.getElementById('kbStructSelect');
  if (sel && sel.value) return sel.value;
  return 'deck_slab';
}

// 末尾指示文（チャットに貼り付けた後、AIが「くろたん」として振る舞うための規約）
function kbInstructionText(structLabel) {
  return `
---
以上、くろたんセットアップ完了です。

あなたは「くろたん」— 石岡組の型枠専任AIです。
上記のドキュメント群（コア知見 + 現場知見 field_notes）を読み込み、
ベテラン型枠職人の経験と、過去の施工知見に基づいて回答してください。

現在の対象構造物: ${structLabel}

◆ 対話のルール
1. まず対象物の全体像を質問で引き出す（01_初期質問プロトコル.md に従う）
2. 施工計画書を書くときは 03_施工計画書作成の要諦.md を必ず参照する
3. 現場知見（field_notes）に該当事例があれば、それを引用しながら助言する
4. ベテラン職人の語彙（08_ベテラン表現変換辞書.md）で話す
5. チャットが一区切りついたら、以下のフォーマットで「知見サマリー」を出力する

◆ 出力フォーマット（知見サマリー）
---知見サマリー開始---
日付: YYYY-MM-DD
作成者: （社員名）
構造物タイプ: （床版 / 地覆・壁高欄 / 擁壁 / 橋台 / 橋脚 / BOX / 基礎）
構造物名: （例: 宿野辺橋 床版 / ○○工事 擁壁No.1）

## 状況

## 対応内容

## 学び・次回への申し送り
---知見サマリー終了---

このサマリーは型知アプリの「知見を登録」ボタンから Supabase の field_notes/ に保存されます。
`;
}

// ────────────────────────────────────────────────
// 1) くろたんセットアップ
// ────────────────────────────────────────────────
async function kbSetupKurotan() {
  const btn = document.getElementById('btnKbSetup');
  if (!btn) return;
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = '準備中...';

  try {
    const structType = kbCurrentStructType();
    const label = KB_STRUCT_LABEL[structType] || structType;
    const coreFiles = [
      ...KB_CORE_FILES._common,
      ...(KB_CORE_FILES[structType] || []),
    ];

    const parts = [];
    parts.push(`# くろたん セットアップパック（対象: ${label}）\n`);
    parts.push(`生成日時: ${new Date().toLocaleString('ja-JP')}\n`);
    parts.push(`\n# === コア知見 ===\n`);

    let okCore = 0, missCore = 0;
    for (const f of coreFiles) {
      const text = await kbDownloadText(`core/${f.slug}`);
      if (text) {
        parts.push(`\n## ${f.title}\n\n${text}\n`);
        okCore++;
      } else {
        parts.push(`\n## ${f.title}\n\n[未登録 — Supabase Storage の ${KB_BUCKET}/core/${f.slug} にアップロードしてください]\n`);
        missCore++;
      }
    }

    parts.push(`\n# === 現場知見 field_notes（${label}） ===\n`);
    const notes = await kbListFieldNotesForType(structType);
    let okNotes = 0;
    if (notes.length === 0) {
      parts.push(`\n（該当する field_notes はまだ登録されていません）\n`);
    } else {
      for (const n of notes) {
        const text = await kbDownloadText(`field_notes/${n.name}`);
        if (text) {
          parts.push(`\n## ${n.name}\n\n${text}\n`);
          okNotes++;
        }
      }
    }

    parts.push(kbInstructionText(label));

    const full = parts.join('');
    await navigator.clipboard.writeText(full);

    const msg = `✓ コピー完了 (core: ${okCore}/${coreFiles.length}、field_notes: ${okNotes}件、${full.length.toLocaleString()}文字)`;
    btn.textContent = msg;
    console.log('[kb]', msg);
    if (missCore > 0) {
      console.warn(`[kb] ${missCore}件のコアファイルが未登録です`);
    }
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 5000);
  } catch (e) {
    console.error('[kb] setup failed', e);
    alert('セットアップに失敗しました: ' + (e.message || e));
    btn.textContent = orig;
    btn.disabled = false;
  }
}

// ────────────────────────────────────────────────
// 2) 知見を登録
// ────────────────────────────────────────────────
function kbOpenRegisterModal() {
  const m = document.getElementById('kbRegisterModal');
  if (!m) return;
  m.style.display = 'flex';
  document.getElementById('kbRegisterTextarea').value = '';
  document.getElementById('kbRegisterStatus').textContent = '';
  document.getElementById('kbRegisterStatus').style.color = '#666';
  // 現在のログインユーザー名を ヒントとして表示
  try {
    const prof = window.__ishiokaAuth?.profile;
    if (prof) {
      const name = prof.display_name || prof.name || prof.employee_number || '';
      document.getElementById('kbRegisterHint').textContent
        = name ? `ログイン中: ${name}` : '';
    }
  } catch {}
}

function kbCloseRegisterModal() {
  const m = document.getElementById('kbRegisterModal');
  if (m) m.style.display = 'none';
}

function kbParseSummary(text) {
  // ---知見サマリー開始--- と ---知見サマリー終了--- の間を抽出（なければ全文をbodyとする）
  const m = text.match(/---\s*知見サマリー開始\s*---([\s\S]*?)---\s*知見サマリー終了\s*---/);
  const body = (m ? m[1] : text).trim();

  const get = (key) => {
    // "日付: 2026-04-24" / "日付：2026-04-24" 両対応、# や - プレフィクスも許容
    const re = new RegExp(`^[#\\-\\s]*${key}\\s*[::]\\s*(.+?)\\s*$`, 'm');
    const mm = body.match(re);
    return mm ? mm[1].trim() : '';
  };

  // 構造物タイプの揺らぎを正規化
  const rawType = get('構造物タイプ');
  const typeMap = {
    '床版': '床版',
    '地覆': '地覆・壁高欄',
    '地覆・壁高欄': '地覆・壁高欄',
    '壁高欄': '地覆・壁高欄',
    '擁壁': '擁壁',
    '橋台': '橋台',
    '橋脚': '橋脚',
    'box': 'BOX',
    'BOX': 'BOX',
    'ボックス': 'BOX',
    'ボックスカルバート': 'BOX',
    '基礎': '基礎',
    'フーチング': '基礎',
  };
  let normType = '';
  for (const k of Object.keys(typeMap)) {
    if (rawType.includes(k)) { normType = typeMap[k]; break; }
  }
  if (!normType) normType = rawType || '未分類';

  return {
    body,
    date: get('日付') || new Date().toISOString().slice(0, 10),
    author: get('作成者') || '不明',
    structType: normType,
    structName: get('構造物名') || '無題',
  };
}

function kbSafeFilename(s) {
  return (s || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

async function kbRegisterKnowledge() {
  const st = document.getElementById('kbRegisterStatus');
  const text = document.getElementById('kbRegisterTextarea').value.trim();
  if (!text) {
    st.style.color = '#c0392b';
    st.textContent = '⚠ テキストが空です';
    return;
  }

  st.style.color = '#666';
  st.textContent = 'パース中...';
  const parsed = kbParseSummary(text);

  // Supabase Storage の key 制約により英数字スラッグ + ts の固定形式
  const structSlug = kbLabelToSlug(parsed.structType);
  // 作成者スラッグ: ログイン中のemployee_numberを優先、なければ "anon"
  let authorSlug = 'anon';
  try {
    const prof = window.__ishiokaAuth?.profile;
    if (prof?.employee_number) authorSlug = String(prof.employee_number);
  } catch {}
  const ts = Date.now().toString(36); // 短いユニークID
  const fname = `${parsed.date}_${authorSlug}_${structSlug}_${ts}.md`;
  const path = `field_notes/${fname}`;

  const msg = `以下の内容で登録しますか？\n\n`
    + `ファイル名: ${fname}\n\n`
    + `日付: ${parsed.date}\n`
    + `作成者: ${parsed.author} (${authorSlug})\n`
    + `構造物タイプ: ${parsed.structType} (${structSlug})\n`
    + `構造物名: ${parsed.structName}`;
  if (!confirm(msg)) {
    st.textContent = '';
    return;
  }

  st.textContent = 'アップロード中...';
  try {
    const sb = kbGetSb();
    if (!sb) throw new Error('Supabase client 未初期化');
    // 本文先頭に YAML front matter でメタ情報を付与（ファイル名は英数字なので、
    // 日本語の構造物名・作成者氏名はここで保持）
    const content = `---\n`
      + `date: ${parsed.date}\n`
      + `author: ${parsed.author}\n`
      + `author_id: ${authorSlug}\n`
      + `struct_type: ${parsed.structType}\n`
      + `struct_slug: ${structSlug}\n`
      + `struct_name: ${parsed.structName}\n`
      + `---\n\n`
      + `# ${parsed.structName}\n\n`
      + parsed.body;
    const blob = new Blob([content], { type: 'text/markdown; charset=utf-8' });
    const { error } = await sb.storage.from(KB_BUCKET).upload(path, blob, {
      upsert: true,
      contentType: 'text/markdown; charset=utf-8',
    });
    if (error) throw error;

    st.style.color = '#27ae60';
    st.innerHTML = `✓ 登録完了: <code>${fname}</code>`;
    setTimeout(kbCloseRegisterModal, 2500);
  } catch (e) {
    console.error('[kb] register failed', e);
    st.style.color = '#c0392b';
    st.textContent = '❌ 登録失敗: ' + (e.message || e);
  }
}

// グローバル公開
window.kbSetupKurotan = kbSetupKurotan;
window.kbOpenRegisterModal = kbOpenRegisterModal;
window.kbCloseRegisterModal = kbCloseRegisterModal;
window.kbRegisterKnowledge = kbRegisterKnowledge;
