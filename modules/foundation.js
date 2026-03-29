// ============================================================
// 型知 KATACHI — 基礎モジュール (foundation.js)
// ============================================================

(function() {
  const FoundationModule = {
    type: 'foundation',
    label: '基礎',

    init(data) {
      enableNav();
      buildFaceNav(data);
      this.buildOverview(data);
      this.buildFaceViews(data);
      this.buildDevelopmentView(data);
      buildQuantities(data);

      // Add development view nav button after face nav
      this._addDevelopmentNavButton();
    },

    redraw(viewId) {
      if (viewId === 'development') {
        this.renderDevelopmentDiagram(appData);
      } else if (viewId.startsWith('face-')) {
        const faceId = viewId.replace('face-', '');
        const face = findFace(faceId);
        if (face) {
          this.renderFaceDiagram(faceId, face);
        }
      }
    },

    // ============================================================
    // Development Nav Button (展開図ボタン追加)
    // ============================================================
    _addDevelopmentNavButton() {
      const faceNav = document.getElementById('faceNavButtons');
      if (!faceNav) return;

      const btn = document.createElement('button');
      btn.className = 'nav-btn';
      btn.dataset.view = 'development';
      btn.onclick = () => switchView('development');
      btn.innerHTML = '4面展開図 <span class="badge" style="background:#e67e22">展開図</span>';
      // Insert at the beginning of face nav
      faceNav.insertBefore(btn, faceNav.firstChild);
    },

    // ============================================================
    // Separator Feasibility Judgment
    // ============================================================
    _sepaJudgment(lengthMm) {
      if (lengthMm <= 4000) return { label: '対面セパ可', color: '#27ae60', warn: '' };
      if (lengthMm <= 6000) return { label: '長尺注意', color: '#f39c12', warn: '（4〜6m: 座屈リスク。太径化または中間サポート検討）' };
      return { label: '控え杭推奨', color: '#e74c3c', warn: '（6m超: 対面セパ困難。控え杭方式を推奨）' };
    },

    // ============================================================
    // Overview
    // ============================================================
    buildOverview(data) {
      const s = data.structure;
      const dim = s.dimensions || {};
      const corner = s.corner_detail || {};
      const cover = s.cover || {};
      const leveling = s.leveling_concrete || {};

      const widthMm = dim.width_mm || 4000;
      const lengthMm = dim.length_mm || 6000;
      const heightMm = dim.height_mm || 1500;

      const largeFaces = (corner.large_faces || ['A', 'C']).join(', ');
      const smallFaces = (corner.small_faces || ['B', 'D']).join(', ');

      const joints = s.joints || {};
      const conJoints = joints.construction_joints || [];

      const widthJudge = this._sepaJudgment(widthMm);
      const lengthJudge = this._sepaJudgment(lengthMm);

      // Face summary table
      let faceSummary = '';
      if (data.phases) {
        data.phases.forEach(ph => {
          (ph.faces || []).forEach(f => {
            const w = f.width_mm ? (f.width_mm / 1000).toFixed(1) + 'm' : '-';
            const h = f.height_mm ? f.height_mm + 'mm' : '-';
            const pc = f.panels ? f.panels.length : '-';
            const sc = f.separators ? f.separators.count || '-' : '-';
            const largeSmall = f.is_large_face ? '<span style="color:#e67e22;font-weight:bold">大面</span>' : '<span style="color:#3498db">小面</span>';
            faceSummary += `<tr><td>${esc(f.id)}</td><td>${esc(f.name || '')} ${largeSmall}</td><td>${w} × ${h}</td><td class="num">${pc}</td><td class="num">${sc}</td></tr>`;
          });
        });
      }

      // Notes
      const noteHtml = (data.notes || []).map(n =>
        `<div class="note-card"><div class="note-cat">${esc(n.category)}</div><div class="note-text">${esc(n.content)}</div></div>`
      ).join('');

      // Phase summary
      let phaseRows = '';
      if (data.phases) {
        data.phases.forEach(ph => {
          const faceCount = (ph.faces || []).length;
          phaseRows += `<tr><td>Phase ${ph.phase}</td><td>${esc(ph.name)}</td><td class="num">${faceCount}面</td></tr>`;
        });
      }

      const el = document.getElementById('view-overview');
      el.innerHTML = `
        <div class="card">
          <div class="card-header">全体確認図 — ${esc(s.name || '')}</div>
          <div class="card-body">
            <div class="overview-grid">
              <div class="info-box">
                <h4>寸法情報</h4>
                <table>
                  <tr><td>幅（短辺）</td><td>${widthMm}mm</td></tr>
                  <tr><td>長さ（長辺）</td><td>${lengthMm}mm</td></tr>
                  <tr><td>高さ</td><td>${heightMm}mm</td></tr>
                  <tr><td>体積</td><td>${((widthMm * lengthMm * heightMm) / 1e9).toFixed(2)}m3</td></tr>
                  <tr><td>サブタイプ</td><td>${esc(s.subtype === 'footing' ? '単独基礎（フーチング）' : s.subtype === 'grade_beam' ? '地中梁' : s.subtype === 'stepped' ? '段差基礎' : s.subtype || '-')}</td></tr>
                </table>
              </div>
              <div class="info-box">
                <h4>コーナー詳細（大面/小面）</h4>
                <table>
                  <tr><td>大面</td><td style="color:#e67e22;font-weight:bold">${esc(largeFaces)}面</td></tr>
                  <tr><td>小面</td><td style="color:#3498db">${esc(smallFaces)}面</td></tr>
                  <tr><td>延長量</td><td>12mm（コンパネ厚分）</td></tr>
                </table>
                <p style="font-size:11px;color:#888;margin-top:6px">${esc(corner.note || 'コーナーで大面が小面端部を覆う')}</p>
              </div>
              <div class="info-box">
                <h4>セパレーター判定</h4>
                <table>
                  <tr><td>幅方向 (${widthMm}mm)</td><td><span style="color:${widthJudge.color};font-weight:bold">${widthJudge.label}</span> ${widthJudge.warn}</td></tr>
                  <tr><td>長さ方向 (${lengthMm}mm)</td><td><span style="color:${lengthJudge.color};font-weight:bold">${lengthJudge.label}</span> ${lengthJudge.warn}</td></tr>
                </table>
                <p style="font-size:11px;color:#888;margin-top:6px">判定基準: 4m以下=OK / 4〜6m=長尺注意 / 6m超=控え杭推奨</p>
              </div>
              <div class="info-box">
                <h4>かぶり</h4>
                <table>
                  <tr><td>底面（土に接する）</td><td>${cover.bottom_soil_mm || '-'}mm</td></tr>
                  <tr><td>側面（土に接する）</td><td>${cover.side_soil_mm || '-'}mm</td></tr>
                  <tr><td>上面</td><td>${cover.top_mm || '-'}mm</td></tr>
                </table>
              </div>
              <div class="info-box">
                <h4>打設フェーズ（${data.phases ? data.phases.length : 0}回）</h4>
                <table>
                  <thead><tr><th></th><th>フェーズ名</th><th>面数</th></tr></thead>
                  <tbody>${phaseRows}</tbody>
                </table>
              </div>
              <div class="info-box">
                <h4>均しコンクリート</h4>
                <table>
                  <tr><td>厚さ</td><td>${leveling.thickness_mm || 50}mm</td></tr>
                  <tr><td>備考</td><td>${esc(leveling.note || '均しコン上に型枠設置（底型枠不要）')}</td></tr>
                </table>
              </div>
              <div class="full">
                <div class="info-box">
                  <h4>面一覧</h4>
                  <table class="qty-table">
                    <thead><tr><th>面ID</th><th>面名</th><th>寸法</th><th>パネル数</th><th>セパ数</th></tr></thead>
                    <tbody>${faceSummary}</tbody>
                  </table>
                </div>
              </div>
              <div class="full" id="overviewCrossSection">
                <div class="card"><div class="card-header">断面図・平面図</div><div class="card-body"><div class="diagram-container" id="crossSectionDiagram"></div></div></div>
              </div>
              ${conJoints.length > 0 ? `<div class="info-box">
                <h4>目地</h4>
                <table>
                  <tr><td>伸縮目地</td><td>なし</td></tr>
                  <tr><td>打継目地</td><td>${conJoints.length}箇所</td></tr>
                  ${conJoints.map(j => '<tr><td>\u3000' + esc(j.position) + '</td><td>' + esc(j.treatment||'') + '</td></tr>').join('')}
                  <tr><td>備考</td><td>${esc(joints.note||'')}</td></tr>
                </table>
              </div>` : ''}
              ${noteHtml ? `<div class="full"><div class="info-box"><h4>注意事項</h4>${noteHtml}</div></div>` : ''}
            </div>
          </div>
        </div>`;

      this.renderCrossSection(data);
    },

    // ============================================================
    // Cross Section + Plan Diagram
    // ============================================================
    renderCrossSection(data) {
      const s = data.structure;
      const dim = s.dimensions || {};
      const widthMm = dim.width_mm || 4000;
      const lengthMm = dim.length_mm || 6000;
      const heightMm = dim.height_mm || 1500;
      const levelingH = (s.leveling_concrete || {}).thickness_mm || 50;

      const svgW = 700, svgH = 400;

      // --- Left half: Side section ---
      const secW = 300, secH = 350;
      const secML = 80, secMT = 30;
      const sc = Math.min((secW - 40) / widthMm, (secH - 80) / (heightMm + levelingH + 200));

      const baseY = secMT + secH - 40;
      const fW = widthMm * sc;
      const fH = heightMm * sc;
      const lvH = levelingH * sc;
      const fLeft = secML;

      let svg = `<svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg" style="font-family:'BIZ UDPGothic','Meiryo',sans-serif">`;

      // Section title
      svg += `<text x="${secML + fW / 2}" y="18" text-anchor="middle" font-size="11" fill="#333" font-weight="bold">側面断面図</text>`;

      // Ground line
      svg += `<line x1="20" y1="${baseY}" x2="${secML + fW + 60}" y2="${baseY}" stroke="#8B4513" stroke-width="1.5" stroke-dasharray="8,4"/>`;
      svg += `<text x="22" y="${baseY + 12}" font-size="8" fill="#8B4513">G.L.</text>`;

      // Leveling concrete
      const lvTop = baseY - lvH;
      svg += `<rect x="${fLeft - 10}" y="${lvTop}" width="${fW + 20}" height="${lvH}" fill="#ddd" stroke="#999" stroke-width="0.8"/>`;
      svg += `<text x="${fLeft + fW / 2}" y="${lvTop + lvH / 2 + 3}" text-anchor="middle" font-size="7" fill="#666">均しコン t=${levelingH}mm</text>`;

      // Footing
      const fTop = lvTop - fH;
      svg += `<rect x="${fLeft}" y="${fTop}" width="${fW}" height="${fH}" fill="#d6eaf8" stroke="#1a5276" stroke-width="1.5"/>`;
      svg += `<text x="${fLeft + fW / 2}" y="${fTop + fH / 2 + 4}" text-anchor="middle" font-size="11" fill="#1a5276" font-weight="bold">フーチング</text>`;

      // Face labels on section
      svg += `<text x="${fLeft - 5}" y="${fTop + fH / 2}" text-anchor="end" font-size="9" fill="#e74c3c">A面→</text>`;
      svg += `<text x="${fLeft + fW + 5}" y="${fTop + fH / 2}" text-anchor="start" font-size="9" fill="#e74c3c">←B面</text>`;
      svg += `<text x="${fLeft + fW / 2}" y="${fTop - 5}" text-anchor="middle" font-size="8" fill="#e74c3c">C面・D面 : 紙面直交方向</text>`;

      // Dimension: width
      svg += dimLine(fLeft, baseY + 16, fLeft + fW, baseY + 16, `${widthMm}mm`);
      // Dimension: height
      svg += dimLineV(fLeft - 16, fTop, fLeft - 16, fTop + fH, `${heightMm}mm`);
      // Root wrapping note
      svg += `<text x="${fLeft + fW / 2}" y="${lvTop - 3}" text-anchor="middle" font-size="7" fill="#e67e22">▲ 根巻きモルタル</text>`;

      // --- Right half: Plan view ---
      const planLeft = 400, planTop = 40;
      const planAreaW = 260, planAreaH = 300;
      const planSc = Math.min((planAreaW - 40) / lengthMm, (planAreaH - 80) / widthMm);
      const pW = lengthMm * planSc;
      const pH = widthMm * planSc;
      const pX = planLeft + (planAreaW - pW) / 2;
      const pY = planTop + (planAreaH - pH) / 2 + 10;

      // Plan title
      svg += `<text x="${planLeft + planAreaW / 2}" y="${planTop}" text-anchor="middle" font-size="11" fill="#333" font-weight="bold">平面図</text>`;

      // Footing rectangle
      svg += `<rect x="${pX}" y="${pY}" width="${pW}" height="${pH}" fill="#d6eaf8" fill-opacity="0.5" stroke="#1a5276" stroke-width="1.5"/>`;

      // Face labels around plan
      svg += `<text x="${pX - 8}" y="${pY + pH / 2}" text-anchor="end" font-size="10" fill="#e74c3c" font-weight="bold">A面</text>`;
      svg += `<text x="${pX - 8}" y="${pY + pH / 2 + 12}" text-anchor="end" font-size="8" fill="#e67e22">大面</text>`;

      svg += `<text x="${pX + pW + 8}" y="${pY + pH / 2}" text-anchor="start" font-size="10" fill="#e74c3c" font-weight="bold">B面</text>`;
      svg += `<text x="${pX + pW + 8}" y="${pY + pH / 2 + 12}" text-anchor="start" font-size="8" fill="#3498db">小面</text>`;

      svg += `<text x="${pX + pW / 2}" y="${pY - 8}" text-anchor="middle" font-size="10" fill="#e74c3c" font-weight="bold">D面</text>`;
      svg += `<text x="${pX + pW / 2}" y="${pY - 20}" text-anchor="middle" font-size="8" fill="#3498db">小面</text>`;

      svg += `<text x="${pX + pW / 2}" y="${pY + pH + 16}" text-anchor="middle" font-size="10" fill="#e74c3c" font-weight="bold">C面</text>`;
      svg += `<text x="${pX + pW / 2}" y="${pY + pH + 28}" text-anchor="middle" font-size="8" fill="#e67e22">大面</text>`;

      // Dimension: length (horizontal)
      svg += dimLine(pX, pY + pH + 40, pX + pW, pY + pH + 40, `${lengthMm}mm`);
      // Dimension: width (vertical)
      svg += dimLineV(pX - 30, pY, pX - 30, pY + pH, `${widthMm}mm`);

      // Corner detail: small arrows showing 12mm extension
      // Top-left corner detail callout
      svg += `<rect x="${pX - 2}" y="${pY - 2}" width="20" height="4" fill="#e67e22" fill-opacity="0.5" stroke="#e67e22" stroke-width="0.5"/>`;
      svg += `<text x="${pX + 22}" y="${pY + 2}" font-size="6" fill="#e67e22">12mm延長</text>`;

      // Legend
      svg += `<rect x="${planLeft + planAreaW - 100}" y="${planTop + planAreaH - 55}" width="95" height="50" fill="#fff" stroke="#ddd" rx="3"/>`;
      svg += `<text x="${planLeft + planAreaW - 95}" y="${planTop + planAreaH - 40}" font-size="8" fill="#333" font-weight="bold">凡例</text>`;
      svg += `<rect x="${planLeft + planAreaW - 95}" y="${planTop + planAreaH - 35}" width="10" height="8" fill="#e67e22" fill-opacity="0.5" stroke="#e67e22" stroke-width="0.5"/>`;
      svg += `<text x="${planLeft + planAreaW - 82}" y="${planTop + planAreaH - 28}" font-size="7" fill="#333">大面</text>`;
      svg += `<rect x="${planLeft + planAreaW - 95}" y="${planTop + planAreaH - 22}" width="10" height="8" fill="#3498db" fill-opacity="0.3" stroke="#3498db" stroke-width="0.5"/>`;
      svg += `<text x="${planLeft + planAreaW - 82}" y="${planTop + planAreaH - 15}" font-size="7" fill="#333">小面</text>`;

      svg += `</svg>`;

      const el = document.getElementById('crossSectionDiagram');
      if (el) el.innerHTML = svg;
    },

    // ============================================================
    // Face Views
    // ============================================================
    buildFaceViews(data) {
      const mainArea = document.getElementById('mainArea');
      if (data.phases) {
        data.phases.forEach(phase => {
          (phase.faces || []).forEach(face => {
            let div = document.getElementById('view-face-' + face.id);
            if (!div) {
              div = document.createElement('div');
              div.id = 'view-face-' + face.id;
              div.style.display = 'none';
              mainArea.appendChild(div);
            }
            this.buildSideFaceView(face, div, data, phase);
          });
        });
      }
    },

    buildSideFaceView(face, container, data, phase) {
      const sep = face.separators || {};
      const isLarge = face.is_large_face;
      const sizeLabel = isLarge ? '大面' : '小面';
      const sizeColor = isLarge ? '#e67e22' : '#3498db';

      const dim = data.structure.dimensions || {};
      const sepaLen = sep.length_mm || 0;
      const sepaJudge = this._sepaJudgment(sepaLen > 0 ? sepaLen : (isLarge ? dim.length_mm : dim.width_mm));

      container.innerHTML = `
        <div class="card">
          <div class="card-header">${esc(face.id)}面 — ${esc(face.name || '')}
            <span class="badge" style="background:${sizeColor}">${sizeLabel}</span>
            ${phase ? `<span class="badge gray">Phase ${phase.phase}</span>` : ''}
          </div>
          <div class="card-body">
            <div class="diagram-container" id="diagram-${face.id}" style="min-height:250px"></div>
            <div class="overview-grid" style="margin-top:16px">
              <div class="info-box">
                <h4>割付情報</h4>
                <table>
                  <tr><td>面寸法</td><td>${face.width_mm ? (face.width_mm / 1000).toFixed(1) : '-'}m × ${face.height_mm || '-'}mm</td></tr>
                  <tr><td>パネル枚数</td><td>${face.panels?.length || '-'}枚</td></tr>
                  <tr><td>使い方</td><td>${esc(face.panel_orientation || '')}使い（${face.panel_width_mm || '-'}×${face.panel_height_mm || '-'}mm）</td></tr>
                  <tr><td>割付方式</td><td>${esc(face.layout_method || '')}</td></tr>
                  <tr><td>大面/小面</td><td style="color:${sizeColor};font-weight:bold">${sizeLabel}${isLarge ? '（コーナーで+12mm延長）' : '（コーナーで大面の内側）'}</td></tr>
                  <tr><td>仕上げ</td><td>${esc(face.finish || '-')}</td></tr>
                </table>
              </div>
              <div class="info-box">
                <h4>セパレーター仕様</h4>
                <table>
                  <tr><td>種類</td><td>${esc(sep.type || '-')} ${esc(sep.diameter || '')}</td></tr>
                  <tr><td>水平ピッチ</td><td>@${sep.pitch_h_mm || '-'}mm</td></tr>
                  <tr><td>垂直ピッチ</td><td>@${sep.pitch_v_mm || '-'}mm</td></tr>
                  <tr><td>段数</td><td>${sep.rows || '-'}段</td></tr>
                  ${sep.rows > 1 ? `<tr><td>段位置</td><td>${(sep.row_positions_mm || []).join(', ')}mm</td></tr>` : ''}
                  <tr><td>セパ長</td><td>${sep.length_mm || '-'}mm</td></tr>
                  <tr><td>セパ判定</td><td style="color:${sepaJudge.color};font-weight:bold">${sepaJudge.label} ${sepaJudge.warn}</td></tr>
                  <tr><td>本数</td><td>${sep.count || '-'}本</td></tr>
                  ${sep.note ? `<tr><td>備考</td><td style="color:#e74c3c">${esc(sep.note)}</td></tr>` : ''}
                </table>
              </div>
            </div>
          </div>
        </div>`;

      this.renderFaceDiagram(face.id, face);
    },

    // ============================================================
    // Face Diagram Renderer
    // ============================================================
    renderFaceDiagram(faceId, face) {
      const el = document.getElementById('diagram-' + faceId);
      if (!el) return;

      const showPanels = document.getElementById('showPanels')?.checked !== false;
      const showSeparators = document.getElementById('showSeparators')?.checked !== false;
      const showDimensions = document.getElementById('showDimensions')?.checked !== false;

      const panels = face.panels || [];
      if (panels.length === 0) {
        el.innerHTML = '<p style="color:#999;text-align:center;padding:40px">パネルデータなし</p>';
        return;
      }

      const faceW = face.width_mm || 6000;
      const faceH = face.height_mm || 1500;
      const sep = face.separators || {};
      const isLarge = face.is_large_face;
      const sizeLabel = isLarge ? '大面' : '小面';
      const sizeColor = isLarge ? '#e67e22' : '#3498db';

      const maxRow = panels.reduce((m, p) => Math.max(m, p.row || 1), 1);

      const marginL = 65, marginR = 60, marginT = 30, marginB = 90;
      const drawW = Math.max(400, Math.min(1000, panels.length * 65));
      const drawH = Math.max(120, Math.min(300, faceH * 0.08));
      const svgW = drawW + marginL + marginR;
      const svgH = drawH + marginT + marginB;
      const scaleX = drawW / faceW;
      const scaleY = drawH / faceH;

      let svg = `<svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg" style="font-family:'BIZ UDPGothic','Meiryo',sans-serif">`;

      // Size badge
      svg += `<rect x="${marginL}" y="3" width="40" height="16" rx="8" fill="${sizeColor}"/>`;
      svg += `<text x="${marginL + 20}" y="14" text-anchor="middle" font-size="9" fill="#fff" font-weight="bold">${sizeLabel}</text>`;

      // Background
      svg += `<rect x="${marginL}" y="${marginT}" width="${drawW}" height="${drawH}" fill="#fafafa" stroke="#ccc" stroke-width="0.5"/>`;

      // Panels (multi-row)
      if (showPanels) {
        const rowGroups = {};
        panels.forEach(p => {
          const r = p.row || 1;
          if (!rowGroups[r]) rowGroups[r] = [];
          rowGroups[r].push(p);
        });

        const rowHeights = {};
        Object.keys(rowGroups).forEach(r => { rowHeights[r] = rowGroups[r][0].height_mm || 900; });
        const totalPanelH = Object.values(rowHeights).reduce((s, h) => s + h, 0);

        let yOff = 0;
        for (let r = 1; r <= maxRow; r++) {
          const rowPanels = rowGroups[r] || [];
          const rowH = rowHeights[r] || 900;
          const rowDrawH = (rowH / totalPanelH) * drawH;
          let xOff = 0;
          rowPanels.forEach(p => {
            const pw = p.width_mm * scaleX;
            const ph = rowDrawH;
            const px = marginL + xOff * scaleX;
            const py = marginT + yOff;
            const isCut = p.type === 'カット';
            svg += `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="${isCut ? '#FFF3B0' : '#fff'}" stroke="#888" stroke-width="0.8"/>`;
            if (pw > 25) {
              svg += `<text x="${px + pw / 2}" y="${py + 14}" text-anchor="middle" font-size="${pw > 40 ? 8 : 6}" fill="#333">${esc(p.id)}</text>`;
              if (pw > 50) {
                svg += `<text x="${px + pw / 2}" y="${py + 25}" text-anchor="middle" font-size="7" fill="#888">${p.width_mm}×${p.height_mm}</text>`;
              }
            }
            xOff += p.width_mm;
          });
          yOff += rowDrawH;
        }
      }

      // Separators (all open circles for C-type)
      if (showSeparators && sep.type) {
        const pitchH = sep.pitch_h_mm || 600;
        const edgeM = sep.edge_margin_mm || 150;
        const rowPositions = sep.row_positions_mm || [faceH / 2];

        for (let x = edgeM; x <= faceW - edgeM + 1; x += pitchH) {
          const sx = marginL + x * scaleX;
          rowPositions.forEach(ry => {
            const sy = marginT + (faceH - ry) * scaleY;
            svg += `<circle cx="${sx}" cy="${sy}" r="3.5" fill="none" stroke="#1a5276" stroke-width="1.2"/>`;
          });
        }
      }

      // Root wrapping note at bottom
      if (showDimensions) {
        svg += `<line x1="${marginL}" y1="${marginT + drawH}" x2="${marginL + drawW}" y2="${marginT + drawH}" stroke="#8B4513" stroke-width="1.5"/>`;
        svg += `<text x="${marginL + drawW / 2}" y="${marginT + drawH + 12}" text-anchor="middle" font-size="8" fill="#8B4513">▼ 均しコンクリート（根巻きモルタル）</text>`;
      }

      // Joint lines
      const jointsData = appData?.structure?.joints || {};
      const conJoints2 = jointsData.construction_joints || [];
      if (showDimensions && conJoints2.length > 0) {
        // Construction joint at top of foundation (horizontal blue dashed)
        svg += `<line x1="${marginL}" y1="${marginT}" x2="${marginL+drawW}" y2="${marginT}" stroke="#0000FF" stroke-width="1.5" stroke-dasharray="6,3"/>`;
        svg += `<text x="${marginL+drawW+5}" y="${marginT+3}" font-size="7" fill="#0000FF">打継目地</text>`;
      }

      // Dimensions
      if (showDimensions) {
        const dimY1 = marginT + drawH + 22;
        const dimY2 = dimY1 + 22;

        // Total width
        svg += dimLine(marginL, dimY1, marginL + drawW, dimY1, `${faceW.toLocaleString()}mm`);

        // Panel widths
        if (maxRow <= 1 && panels.length <= 12) {
          let dx = 0;
          panels.forEach(p => {
            const px1 = marginL + dx * scaleX;
            const px2 = marginL + (dx + p.width_mm) * scaleX;
            if (px2 - px1 > 18) {
              svg += dimLine(px1, dimY2, px2, dimY2, `${p.width_mm}`);
            }
            dx += p.width_mm;
          });
        }

        // Separator pitch
        if (sep.pitch_h_mm) {
          const dimY3 = dimY2 + 18;
          svg += `<text x="${marginL + drawW / 2}" y="${dimY3}" text-anchor="middle" font-size="9" fill="#1a5276">@${sep.pitch_h_mm}（セパピッチ）  セパ長:${sep.length_mm || '-'}mm</text>`;
        }

        // Height
        svg += dimLineV(marginL - 10, marginT, marginL - 10, marginT + drawH, `${faceH}mm`);

        // Sepa row labels
        if (sep.row_positions_mm && sep.rows > 1) {
          sep.row_positions_mm.forEach((ry, i) => {
            const sy = marginT + (faceH - ry) * scaleY;
            svg += `<text x="${marginL + drawW + 8}" y="${sy + 3}" font-size="7" fill="#1a5276">${i + 1}段 ${ry}mm</text>`;
          });
        }
      }

      svg += `</svg>`;
      el.innerHTML = svg;
    },

    // ============================================================
    // 4面展開図 (Development Diagram) — KEY FEATURE
    // ============================================================
    buildDevelopmentView(data) {
      const mainArea = document.getElementById('mainArea');
      let div = document.getElementById('view-development');
      if (!div) {
        div = document.createElement('div');
        div.id = 'view-development';
        div.style.display = 'none';
        mainArea.appendChild(div);
      }

      div.innerHTML = `
        <div class="card">
          <div class="card-header">4面展開図 — ${esc(data.structure.name || '')}
            <span class="badge" style="background:#e67e22">展開図</span>
          </div>
          <div class="card-body">
            <p style="font-size:12px;color:#666;margin-bottom:12px">
              中央に平面図、四方に各面の割付展開図を配置。大面（オレンジ枠）はコーナーで12mm延長。小面（青枠）は大面の内側に納まる。○ = C型セパ位置。
            </p>
            <div class="diagram-container" id="diagram-development" style="min-height:500px;overflow:auto"></div>
          </div>
        </div>`;

      this.renderDevelopmentDiagram(data);
    },

    renderDevelopmentDiagram(data) {
      const el = document.getElementById('diagram-development');
      if (!el) return;

      const showPanels = document.getElementById('showPanels')?.checked !== false;
      const showSeparators = document.getElementById('showSeparators')?.checked !== false;
      const showDimensions = document.getElementById('showDimensions')?.checked !== false;

      const s = data.structure;
      const dim = s.dimensions || {};
      const widthMm = dim.width_mm || 4000;
      const lengthMm = dim.length_mm || 6000;
      const heightMm = dim.height_mm || 1500;

      // Find faces
      const faceA = findFace('A');
      const faceB = findFace('B');
      const faceC = findFace('C');
      const faceD = findFace('D');

      // Layout geometry
      // Center plan rectangle, surrounded by 4 face diagrams
      // Face height in diagram = faceH (same for all 4 faces)
      const gap = 30;
      const planPad = 20;

      // Scale: fit everything into ~1100 x 900 px
      // Horizontal: faceHeight + gap + planLength + gap + faceHeight
      // Vertical: faceHeight + gap + planWidth + gap + faceHeight
      const targetW = 1100, targetH = 900;
      const totalNeedW = heightMm + gap + lengthMm + gap + heightMm;
      const totalNeedH = heightMm + gap + widthMm + gap + heightMm;
      const sc = Math.min((targetW - 80) / totalNeedW, (targetH - 80) / totalNeedH, 0.12);

      const planW = lengthMm * sc;
      const planH = widthMm * sc;
      const fH = heightMm * sc; // face height in diagram (all faces same height)
      const longFaceW = lengthMm * sc; // A, B face width
      const shortFaceW = widthMm * sc; // C, D face width

      const svgW = Math.max(targetW, fH + gap + planW + gap + fH + 80);
      const svgH = Math.max(targetH, fH + gap + planH + gap + fH + 80);

      // Center of SVG
      const cx = svgW / 2;
      const cy = svgH / 2;

      // Plan rectangle position (center)
      const planX = cx - planW / 2;
      const planY = cy - planH / 2;

      let svg = `<svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg" style="font-family:'BIZ UDPGothic','Meiryo',sans-serif">`;

      // ---- Center plan view ----
      svg += `<rect x="${planX}" y="${planY}" width="${planW}" height="${planH}" fill="#d6eaf8" fill-opacity="0.4" stroke="#1a5276" stroke-width="2"/>`;
      svg += `<text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="12" fill="#1a5276" font-weight="bold">平面図</text>`;
      svg += `<text x="${cx}" y="${cy + 10}" text-anchor="middle" font-size="10" fill="#666">${lengthMm}×${widthMm}mm</text>`;

      // Face labels on plan edges
      svg += `<text x="${planX - 6}" y="${cy}" text-anchor="end" font-size="11" fill="#e74c3c" font-weight="bold">A面</text>`;
      svg += `<text x="${planX + planW + 6}" y="${cy}" text-anchor="start" font-size="11" fill="#e74c3c" font-weight="bold">B面</text>`;
      svg += `<text x="${cx}" y="${planY + planH + 16}" text-anchor="middle" font-size="11" fill="#e74c3c" font-weight="bold">C面</text>`;
      svg += `<text x="${cx}" y="${planY - 6}" text-anchor="middle" font-size="11" fill="#e74c3c" font-weight="bold">D面</text>`;

      // Fold lines (dashed) connecting plan edges to face diagrams
      svg += `<line x1="${planX}" y1="${planY}" x2="${planX}" y2="${planY + planH}" stroke="#1a5276" stroke-width="1" stroke-dasharray="4,3"/>`;
      svg += `<line x1="${planX + planW}" y1="${planY}" x2="${planX + planW}" y2="${planY + planH}" stroke="#1a5276" stroke-width="1" stroke-dasharray="4,3"/>`;

      // ---- Helper: draw a face panel layout ----
      const drawFaceLayout = (face, fx, fy, fw, fh, faceLabel, isLarge, rotate) => {
        if (!face) return '';
        let out = '';
        const borderColor = isLarge ? '#e67e22' : '#3498db';
        const fillColor = isLarge ? 'rgba(230,126,34,0.05)' : 'rgba(52,152,219,0.05)';

        // Face background with colored border
        out += `<rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" fill="${fillColor}" stroke="${borderColor}" stroke-width="2"/>`;

        // Label
        const labelStr = isLarge ? `${faceLabel}（大面）` : `${faceLabel}（小面）`;
        out += `<text x="${fx + fw / 2}" y="${fy - 5}" text-anchor="middle" font-size="10" fill="${borderColor}" font-weight="bold">${labelStr}</text>`;

        const panels = face.panels || [];
        if (panels.length === 0) return out;

        const faceWmm = face.width_mm || fw;
        const faceHmm = face.height_mm || fh;
        const scX = fw / faceWmm;
        const scY = fh / faceHmm;

        // Draw panels
        if (showPanels) {
          const maxRow = panels.reduce((m, p) => Math.max(m, p.row || 1), 1);
          const rowGroups = {};
          panels.forEach(p => { const r = p.row || 1; if (!rowGroups[r]) rowGroups[r] = []; rowGroups[r].push(p); });
          const rowHeights = {};
          Object.keys(rowGroups).forEach(r => { rowHeights[r] = rowGroups[r][0].height_mm || 900; });
          const totalPH = Object.values(rowHeights).reduce((s, h) => s + h, 0);

          let yOff = 0;
          for (let r = 1; r <= maxRow; r++) {
            const rowPanels = rowGroups[r] || [];
            const rowH = rowHeights[r] || 900;
            const rowDrawH = (rowH / totalPH) * fh;
            let xOff = 0;
            rowPanels.forEach(p => {
              const pw = p.width_mm * scX;
              const ph = rowDrawH;
              const px = fx + xOff * scX;
              const py = fy + yOff;
              const isCut = p.type === 'カット';
              out += `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="${isCut ? '#FFF3B0' : '#fff'}" stroke="#999" stroke-width="0.5"/>`;
              if (pw > 12 && ph > 10) {
                out += `<text x="${px + pw / 2}" y="${py + ph / 2 + 3}" text-anchor="middle" font-size="${Math.min(8, pw / 4)}" fill="#555">${p.width_mm}</text>`;
              }
              xOff += p.width_mm;
            });
            yOff += rowDrawH;
          }
        }

        // Separators
        if (showSeparators && face.separators) {
          const sep = face.separators;
          const pitchH = sep.pitch_h_mm || 600;
          const edgeM = sep.edge_margin_mm || 150;
          const rowPositions = sep.row_positions_mm || [faceHmm / 2];

          for (let x = edgeM; x <= faceWmm - edgeM + 1; x += pitchH) {
            const sx = fx + x * scX;
            rowPositions.forEach(ry => {
              const sy = fy + (faceHmm - ry) * scY;
              out += `<circle cx="${sx}" cy="${sy}" r="2.5" fill="none" stroke="#1a5276" stroke-width="0.8"/>`;
            });
          }
        }

        // Dimension
        if (showDimensions) {
          out += `<text x="${fx + fw / 2}" y="${fy + fh + 12}" text-anchor="middle" font-size="8" fill="#666">${faceWmm}×${faceHmm}mm</text>`;
        }

        return out;
      };

      // ---- A face (LEFT of plan) ----
      // A face: long side (lengthMm x heightMm), displayed vertically to the left
      // In the development layout: face is rotated 90deg conceptually
      // We draw it as: width = fH (heightMm), height = planH (widthMm mapped to longFaceW actually)
      // Actually: A face is long side. Width = lengthMm (6000), Height = heightMm (1500)
      // In development diagram: A is LEFT of plan. It unfolds leftward.
      // A face diagram: width = longFaceW, height = fH. Placed left of plan, rotated.
      // Convention: left face unfolds to the left, so its width (6000mm) aligns with plan's vertical (widthMm mapped).
      // Actually: the long face (A) has face width = lengthMm, the plan's left edge corresponds to the long edge.
      // So A face: face width maps to plan height direction, face height extends leftward.
      const aFaceX = planX - gap - fH;
      const aFaceY = planY;
      // A face: drawn with face_width along Y-axis (plan's left edge height = planH should match face_width=6000)
      // But planH = widthMm * sc, while A face width = lengthMm... they don't match.
      // The plan's LEFT edge length = widthMm (4000). But A face is the long side = 6000mm.
      // Hmm, let me reconsider. A and B are LONG sides (6000mm). The plan rectangle has:
      //   horizontal = lengthMm (6000), vertical = widthMm (4000)
      // A face sits on the LEFT edge of the plan. The LEFT edge has length = planH = widthMm*sc.
      // But A face width = 6000mm (long side). This doesn't match the left edge.
      //
      // Actually: In a rectangular footing, A is one of the long sides.
      // In plan view, long sides are TOP and BOTTOM (horizontal edges = lengthMm = 6000).
      // Short sides are LEFT and RIGHT (vertical edges = widthMm = 4000).
      // So: A (long, large) = LEFT unfold from TOP edge
      //     B (long, small) = RIGHT unfold from BOTTOM edge...
      //
      // Let me use a clearer convention:
      // Plan: horizontal = length (6000), vertical = width (4000)
      // A face (long side, 6000 wide) attaches to LEFT vertical edge of plan? No...
      //
      // Standard development:
      //   - A (long side) unfolds to the LEFT of plan
      //   - B (long side) unfolds to the RIGHT of plan
      //   - C (short side) unfolds BELOW plan
      //   - D (short side) unfolds ABOVE plan
      //
      // But plan LEFT edge is short (widthMm=4000). A face is long (6000mm).
      // The trick: in development, A face's WIDTH (6000) matches the plan's horizontal TOP/BOTTOM edge.
      // So A should unfold from a horizontal edge. Let me reconsider layout:
      //
      // Better layout:
      //   - LEFT of plan: C face (short side, 4000mm) — matches plan's left edge height (4000)
      //   - RIGHT of plan: D face (short side, 4000mm) — matches plan's right edge height (4000)
      //   - ABOVE plan: A face (long side, 6000mm) — matches plan's top edge width (6000)
      //   - BELOW plan: B face (long side, 6000mm) — matches plan's bottom edge width (6000)
      //
      // Wait, but the spec says: A (left), B (right), C (bottom), D (top).
      // That means the plan edges must match face widths.
      // If plan is oriented so LEFT edge = 6000 (long) and RIGHT edge = 6000 (long),
      // then plan: horizontal = widthMm (4000), vertical = lengthMm (6000).
      // Plan rotated 90 degrees from what I had.

      // Let me re-layout with plan: horizontal = widthMm, vertical = lengthMm
      // Then:
      //   LEFT edge (vertical, 6000) -> A face (6000 wide) -> unfolds left, height = heightMm
      //   RIGHT edge (vertical, 6000) -> B face (6000 wide) -> unfolds right
      //   BOTTOM edge (horizontal, 4000) -> C face (4000 wide) -> unfolds down
      //   TOP edge (horizontal, 4000) -> D face (4000 wide) -> unfolds up

      // Recalculate with rotated plan
      const planW2 = widthMm * sc;   // horizontal = width (4000)
      const planH2 = lengthMm * sc;  // vertical = length (6000)
      const longFW = lengthMm * sc;  // A,B face diagram width = 6000
      const shortFW = widthMm * sc;  // C,D face diagram width = 4000

      const svgW2 = Math.max(1100, fH + gap + planW2 + gap + fH + 100);
      const svgH2 = Math.max(900, fH + gap + planH2 + gap + fH + 100);
      const cx2 = svgW2 / 2;
      const cy2 = svgH2 / 2;
      const planX2 = cx2 - planW2 / 2;
      const planY2 = cy2 - planH2 / 2;

      // Clear previous and restart SVG with corrected dimensions
      svg = `<svg viewBox="0 0 ${svgW2} ${svgH2}" width="${svgW2}" height="${svgH2}" xmlns="http://www.w3.org/2000/svg" style="font-family:'BIZ UDPGothic','Meiryo',sans-serif">`;

      // Title
      svg += `<text x="${cx2}" y="18" text-anchor="middle" font-size="14" fill="#1a5276" font-weight="bold">4面展開図 — ${esc(s.name || '')}</text>`;

      // ---- Center plan view ----
      svg += `<rect x="${planX2}" y="${planY2}" width="${planW2}" height="${planH2}" fill="#d6eaf8" fill-opacity="0.35" stroke="#1a5276" stroke-width="2"/>`;
      svg += `<text x="${cx2}" y="${cy2 - 8}" text-anchor="middle" font-size="13" fill="#1a5276" font-weight="bold">平面図</text>`;
      svg += `<text x="${cx2}" y="${cy2 + 8}" text-anchor="middle" font-size="10" fill="#555">${widthMm}×${lengthMm}mm</text>`;
      svg += `<text x="${cx2}" y="${cy2 + 22}" text-anchor="middle" font-size="9" fill="#888">H=${heightMm}mm</text>`;

      // Face labels on plan edges
      svg += `<text x="${planX2 - gap / 2}" y="${cy2}" text-anchor="middle" font-size="10" fill="#e74c3c" transform="rotate(-90,${planX2 - gap / 2},${cy2})">A面→</text>`;
      svg += `<text x="${planX2 + planW2 + gap / 2}" y="${cy2}" text-anchor="middle" font-size="10" fill="#e74c3c" transform="rotate(90,${planX2 + planW2 + gap / 2},${cy2})">←B面</text>`;
      svg += `<text x="${cx2}" y="${planY2 + planH2 + gap / 2 + 4}" text-anchor="middle" font-size="10" fill="#e74c3c">C面 ↓</text>`;
      svg += `<text x="${cx2}" y="${planY2 - gap / 2 + 4}" text-anchor="middle" font-size="10" fill="#e74c3c">↑ D面</text>`;

      // ---- A face: LEFT (long side, large) ----
      // A face width=6000, height=1500. Unfolds left from plan's left edge.
      // A face diagram: oriented vertically to match plan's left edge (planH2 = 6000*sc = longFW)
      // Face diagram box: width = fH (height of footing mapped), height = longFW (length)
      const aX = planX2 - gap - fH;
      const aY = planY2; // align top with plan top
      svg += drawFaceLayout(faceA, aX, aY, fH, longFW, 'A面', faceA?.is_large_face !== false, true);

      // ---- B face: RIGHT (long side, small) ----
      const bX = planX2 + planW2 + gap;
      const bY = planY2;
      svg += drawFaceLayout(faceB, bX, bY, fH, longFW, 'B面', faceB?.is_large_face === true, true);

      // ---- C face: BOTTOM (short side, large) ----
      // C face width=4000, height=1500. Unfolds below plan's bottom edge.
      const cX = planX2; // align left with plan left
      const cY = planY2 + planH2 + gap;
      svg += drawFaceLayout(faceC, cX, cY, shortFW, fH, 'C面', faceC?.is_large_face !== false, false);

      // ---- D face: TOP (short side, small) ----
      const dX = planX2;
      const dY = planY2 - gap - fH;
      svg += drawFaceLayout(faceD, dX, dY, shortFW, fH, 'D面', faceD?.is_large_face === true, false);

      // ---- Fold lines (connecting plan edges to face diagrams) ----
      // Left fold lines
      svg += `<line x1="${planX2}" y1="${planY2}" x2="${aX + fH}" y2="${aY}" stroke="#aaa" stroke-width="0.8" stroke-dasharray="4,3"/>`;
      svg += `<line x1="${planX2}" y1="${planY2 + planH2}" x2="${aX + fH}" y2="${aY + longFW}" stroke="#aaa" stroke-width="0.8" stroke-dasharray="4,3"/>`;
      // Right fold lines
      svg += `<line x1="${planX2 + planW2}" y1="${planY2}" x2="${bX}" y2="${bY}" stroke="#aaa" stroke-width="0.8" stroke-dasharray="4,3"/>`;
      svg += `<line x1="${planX2 + planW2}" y1="${planY2 + planH2}" x2="${bX}" y2="${bY + longFW}" stroke="#aaa" stroke-width="0.8" stroke-dasharray="4,3"/>`;
      // Bottom fold lines
      svg += `<line x1="${planX2}" y1="${planY2 + planH2}" x2="${cX}" y2="${cY}" stroke="#aaa" stroke-width="0.8" stroke-dasharray="4,3"/>`;
      svg += `<line x1="${planX2 + planW2}" y1="${planY2 + planH2}" x2="${cX + shortFW}" y2="${cY}" stroke="#aaa" stroke-width="0.8" stroke-dasharray="4,3"/>`;
      // Top fold lines
      svg += `<line x1="${planX2}" y1="${planY2}" x2="${dX}" y2="${dY + fH}" stroke="#aaa" stroke-width="0.8" stroke-dasharray="4,3"/>`;
      svg += `<line x1="${planX2 + planW2}" y1="${planY2}" x2="${dX + shortFW}" y2="${dY + fH}" stroke="#aaa" stroke-width="0.8" stroke-dasharray="4,3"/>`;

      // ---- Corner detail annotations ----
      // Top-left corner: A(large) extends 12mm to cover D(small)
      const cornerAnnotX = aX + fH - 2;
      const cornerAnnotY = aY - 2;
      svg += `<rect x="${cornerAnnotX - 6}" y="${cornerAnnotY - 6}" width="12" height="12" fill="none" stroke="#e67e22" stroke-width="1.5"/>`;
      svg += `<text x="${cornerAnnotX + 10}" y="${cornerAnnotY}" font-size="7" fill="#e67e22">大面が小面を覆う</text>`;
      svg += `<text x="${cornerAnnotX + 10}" y="${cornerAnnotY + 9}" font-size="7" fill="#e67e22">(+12mm延長)</text>`;

      // ---- Legend ----
      const legX = svgW2 - 160, legY = svgH2 - 80;
      svg += `<rect x="${legX}" y="${legY}" width="150" height="70" fill="#fff" stroke="#ddd" rx="4"/>`;
      svg += `<text x="${legX + 10}" y="${legY + 15}" font-size="9" fill="#333" font-weight="bold">凡例</text>`;
      svg += `<rect x="${legX + 10}" y="${legY + 22}" width="14" height="10" fill="rgba(230,126,34,0.1)" stroke="#e67e22" stroke-width="1.5"/>`;
      svg += `<text x="${legX + 30}" y="${legY + 31}" font-size="8" fill="#333">大面（コーナー+12mm）</text>`;
      svg += `<rect x="${legX + 10}" y="${legY + 37}" width="14" height="10" fill="rgba(52,152,219,0.1)" stroke="#3498db" stroke-width="1.5"/>`;
      svg += `<text x="${legX + 30}" y="${legY + 46}" font-size="8" fill="#333">小面（大面の内側）</text>`;
      svg += `<circle cx="${legX + 17}" cy="${legY + 57}" r="3" fill="none" stroke="#1a5276" stroke-width="1"/>`;
      svg += `<text x="${legX + 30}" y="${legY + 60}" font-size="8" fill="#333">C型セパ位置</text>`;

      svg += `</svg>`;
      el.innerHTML = svg;
    },

    // ============================================================
    // 3D View
    // ============================================================
    build3D(data, scene) {
      const s = data.structure;
      const dim = s.dimensions || {};
      const widthMm = dim.width_mm || 4000;   // X direction (short)
      const lengthMm = dim.length_mm || 6000;  // Z direction (long)
      const heightMm = dim.height_mm || 1500;  // Y direction
      const levelingH = (s.leveling_concrete || {}).thickness_mm || 50;

      // Camera
      set3DCameraTarget(widthMm / 2, heightMm / 2, lengthMm / 2, Math.max(widthMm, lengthMm, heightMm) * 1.5);

      // Face finder
      const ff = id => {
        for (const ph of (data.phases || [])) {
          for (const f of (ph.faces || [])) {
            if (f.id === id) return f;
          }
        }
        return { id, name: id, panels: [], separators: null };
      };

      // ---- Ground plane ----
      const groundGeo = new THREE.PlaneGeometry(widthMm + 3000, lengthMm + 3000);
      const groundMat = new THREE.MeshLambertMaterial({ color: 0x8B7355, transparent: true, opacity: 0.25 });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(widthMm / 2, -levelingH - 10, lengthMm / 2);
      scene.add(ground);

      // ---- Leveling concrete ----
      const lvGeo = new THREE.BoxGeometry(widthMm + 200, levelingH, lengthMm + 200);
      const lvMat = new THREE.MeshLambertMaterial({ color: 0xcccccc, transparent: true, opacity: 0.4 });
      const lvMesh = new THREE.Mesh(lvGeo, lvMat);
      lvMesh.position.set(widthMm / 2, -levelingH / 2, lengthMm / 2);
      scene.add(lvMesh);

      // ---- Footing concrete (translucent) ----
      const footGeo = new THREE.BoxGeometry(widthMm, heightMm, lengthMm);
      const footMat = new THREE.MeshLambertMaterial({ color: 0xd6eaf8, transparent: true, opacity: 0.2 });
      const footMesh = new THREE.Mesh(footGeo, footMat);
      footMesh.position.set(widthMm / 2, heightMm / 2, lengthMm / 2);
      scene.add(footMesh);

      // ---- Construction joint plane at top of foundation ----
      const jointsData3D = s.joints || {};
      const conJoints3D = jointsData3D.construction_joints || [];
      if (conJoints3D.length > 0) {
        const jointGeo = new THREE.PlaneGeometry(widthMm + 40, lengthMm + 40);
        const jointMat = new THREE.MeshLambertMaterial({ color: 0x0000FF, transparent: true, opacity: 0.15, side: THREE.DoubleSide });
        const jointMesh = new THREE.Mesh(jointGeo, jointMat);
        jointMesh.rotation.x = -Math.PI / 2;
        jointMesh.position.set(widthMm / 2, heightMm, lengthMm / 2);
        scene.add(jointMesh);

        // Dashed outline for the joint plane
        const jointEdge = [
          new THREE.Vector3(-20, heightMm + 1, -20),
          new THREE.Vector3(widthMm + 20, heightMm + 1, -20),
          new THREE.Vector3(widthMm + 20, heightMm + 1, lengthMm + 20),
          new THREE.Vector3(-20, heightMm + 1, lengthMm + 20),
          new THREE.Vector3(-20, heightMm + 1, -20)
        ];
        const jointLineMat = new THREE.LineDashedMaterial({ color: 0x0000FF, dashSize: 100, gapSize: 50 });
        const jointLineGeo = new THREE.BufferGeometry().setFromPoints(jointEdge);
        const jointLine = new THREE.Line(jointLineGeo, jointLineMat);
        jointLine.computeLineDistances();
        scene.add(jointLine);
      }

      // ---- Edge lines ----
      const edgeMat = new THREE.LineBasicMaterial({ color: 0x1a5276 });
      // Bottom rect
      const bottomEdge = [
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(widthMm, 0, 0),
        new THREE.Vector3(widthMm, 0, lengthMm), new THREE.Vector3(0, 0, lengthMm), new THREE.Vector3(0, 0, 0)
      ];
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(bottomEdge), edgeMat));
      // Top rect
      const topEdge = bottomEdge.map(p => new THREE.Vector3(p.x, heightMm, p.z));
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(topEdge), edgeMat));
      // Vertical edges
      [[0, 0], [widthMm, 0], [widthMm, lengthMm], [0, lengthMm]].forEach(([x, z]) => {
        scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(x, 0, z), new THREE.Vector3(x, heightMm, z)
        ]), edgeMat));
      });

      // ---- Formwork face meshes ----
      // A face: long side (6000 wide, 1500 high). Placed at X=0 (left side along Z)
      // B face: long side. Placed at X=widthMm (right side along Z)
      // C face: short side (4000 wide, 1500 high). Placed at Z=lengthMm (far side along X)
      // D face: short side. Placed at Z=0 (near side along X)
      const fA = ff('A');
      const fB = ff('B');
      const fC = ff('C');
      const fD = ff('D');

      const meshA = createFaceMesh(fA, lengthMm, heightMm);
      const meshB = createFaceMesh(fB, lengthMm, heightMm);
      const meshC = createFaceMesh(fC, widthMm, heightMm);
      const meshD = createFaceMesh(fD, widthMm, heightMm);

      [meshA, meshB, meshC, meshD].forEach(m => scene.add(m));

      // ---- Face positions (folded = box, unfolded = flat development) ----
      const faces3D = [
        // A face: X=0 plane, facing -X
        {
          mesh: meshA,
          folded: { pos: [0, heightMm / 2, lengthMm / 2], rot: [0, -Math.PI / 2, 0] },
          unfolded: { pos: [-heightMm / 2 - 200, 0, lengthMm / 2], rot: [-Math.PI / 2, 0, 0] }
        },
        // B face: X=widthMm plane, facing +X
        {
          mesh: meshB,
          folded: { pos: [widthMm, heightMm / 2, lengthMm / 2], rot: [0, Math.PI / 2, 0] },
          unfolded: { pos: [widthMm + heightMm / 2 + 200, 0, lengthMm / 2], rot: [-Math.PI / 2, 0, 0] }
        },
        // C face: Z=lengthMm plane, facing +Z
        {
          mesh: meshC,
          folded: { pos: [widthMm / 2, heightMm / 2, lengthMm], rot: [0, 0, 0] },
          unfolded: { pos: [widthMm / 2, 0, lengthMm + heightMm / 2 + 200], rot: [-Math.PI / 2, 0, 0] }
        },
        // D face: Z=0 plane, facing -Z
        {
          mesh: meshD,
          folded: { pos: [widthMm / 2, heightMm / 2, 0], rot: [0, Math.PI, 0] },
          unfolded: { pos: [widthMm / 2, 0, -heightMm / 2 - 200], rot: [-Math.PI / 2, 0, 0] }
        }
      ];

      // Set initial state (folded)
      faces3D.forEach(f => {
        f.mesh.position.set(...f.folded.pos);
        f.mesh.rotation.set(...f.folded.rot);
      });

      register3DFaces(faces3D);
    },

    // ============================================================
    // PDF Export
    // ============================================================
    exportPDF(data) {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
      const pw = 420, ph = 297, m = 15;

      const s = data.structure;
      const dim = s.dimensions || {};

      // Page 1: Overview
      pdfDrawHeaderFooter(doc, '基礎 全体確認図', 1, 3);
      let y = m + 35;
      doc.setFontSize(9);
      doc.setTextColor(0);
      doc.text(`構造物: ${s.name || '-'}（${s.subtype || '-'}）`, m + 10, y); y += 7;
      doc.text(`寸法: 幅${dim.width_mm || '-'}mm × 長さ${dim.length_mm || '-'}mm × 高さ${dim.height_mm || '-'}mm`, m + 10, y); y += 7;

      const corner = s.corner_detail || {};
      doc.text(`大面: ${(corner.large_faces || []).join(',')}面 / 小面: ${(corner.small_faces || []).join(',')}面`, m + 10, y); y += 7;

      const widthJ = this._sepaJudgment(dim.width_mm || 4000);
      const lengthJ = this._sepaJudgment(dim.length_mm || 6000);
      doc.text(`セパ判定 — 幅方向: ${widthJ.label} / 長さ方向: ${lengthJ.label}`, m + 10, y); y += 10;

      doc.setFontSize(8);
      (data.notes || []).forEach(n => {
        doc.setTextColor(200, 100, 0);
        doc.text(`[${n.category}]`, m + 10, y);
        doc.setTextColor(80);
        doc.text(n.content.substring(0, 90), m + 40, y);
        y += 6;
      });

      // Page 2: Face layouts
      doc.addPage('a3', 'landscape');
      pdfDrawHeaderFooter(doc, '各面割付図 / 4面展開図', 2, 3);
      y = m + 30;
      doc.setFontSize(10);
      doc.setTextColor(0);
      if (data.phases) {
        data.phases.forEach(phase => {
          doc.setFontSize(11);
          doc.text(`Phase ${phase.phase}: ${phase.name}`, m + 10, y); y += 8;
          (phase.faces || []).forEach(face => {
            doc.setFontSize(9);
            const sep = face.separators || {};
            const ls = face.is_large_face ? '大面' : '小面';
            doc.text(`  ${face.id}面 [${ls}]: ${face.name} — ${face.width_mm ? (face.width_mm / 1000).toFixed(1) + 'm' : '-'} × ${face.height_mm || '-'}mm — パネル${face.panels?.length || 0}枚 — セパ${sep.count || 0}本(${sep.type || '-'}) L=${sep.length_mm || '-'}mm`, m + 10, y);
            y += 6;
          });
          y += 4;
        });
      }

      // Page 3: Quantities
      doc.addPage('a3', 'landscape');
      pdfDrawHeaderFooter(doc, '数量表', 3, 3);
      y = m + 30;
      doc.setFontSize(10);
      doc.text('型枠割付数量表', m + 10, y); y += 8;
      doc.setFontSize(8);
      const q = data.quantities || {};
      (q.panels?.summary || []).forEach(r => {
        doc.text(`${r.face}: ${r.size} ${r.type} × ${r.count}枚 = ${r.area_m2?.toFixed(2) || '-'}m2`, m + 15, y);
        y += 5;
      });
      y += 5;
      doc.setFontSize(9);
      doc.text(`合計: ${q.panels?.total_count || 0}枚 / ${q.panels?.total_area_m2?.toFixed(2) || '-'}m2`, m + 15, y);
      y += 10;
      doc.text('セパレーター', m + 10, y); y += 6;
      doc.setFontSize(8);
      (q.separators?.summary || []).forEach(r => {
        doc.text(`${r.face}: ${r.type} ${r.diameter} L=${r.length_mm}mm × ${r.count}本`, m + 15, y);
        y += 5;
      });
      y += 3;
      doc.setFontSize(9);
      doc.text(`セパ合計: ${q.separators?.total_count || 0}本`, m + 15, y);

      const filename = `${data.project?.name || 'foundation'}_型枠割付_${data.project?.created_at || 'draft'}.pdf`;
      doc.save(filename);
    }
  };

  registerModule('foundation', FoundationModule);
})();
