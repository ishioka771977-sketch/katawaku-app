// ============================================================
// 型知 KATACHI — 橋台モジュール (abutment.js)
// ============================================================

(function() {
  const AbutmentModule = {
    type: 'abutment',
    label: '橋台',

    init(data) {
      enableNav();
      buildFaceNav(data);
      this.buildOverview(data);
      this.buildFaceViews(data);
      buildQuantities(data);
    },

    redraw(viewId) {
      if (viewId.startsWith('face-')) {
        const faceId = viewId.replace('face-', '');
        const face = findFace(faceId);
        if (face && face.face_type === 'side') {
          this.renderFaceDiagram(faceId, face);
        }
      }
    },

    // ============================================================
    // Overview
    // ============================================================
    buildOverview(data) {
      const s = data.structure;
      const footing = s.footing || {};
      const stem = s.stem || {};
      const parapet = s.parapet || {};
      const wingWall = s.wing_wall || {};
      const joints = s.joints || {};
      const conJoints = joints.construction_joints || [];

      // Face summary table
      let faceSummary = '';
      if (data.phases) {
        data.phases.forEach(ph => {
          (ph.faces || []).forEach(f => {
            const w = f.width_mm ? (f.width_mm / 1000).toFixed(1) + 'm' : '-';
            const h = f.height_mm ? f.height_mm + 'mm' : '-';
            const pc = f.panels ? f.panels.length : '-';
            const sc = f.separators ? f.separators.count || '-' : '-';
            faceSummary += `<tr><td>${esc(f.id)}</td><td>${esc(f.name || '')}</td><td>${w} × ${h}</td><td class="num">${pc}</td><td class="num">${sc}</td></tr>`;
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

      // Construction joint rows
      let jointRows = '';
      conJoints.forEach(j => {
        jointRows += `<tr><td>${esc(j.position)}</td><td>${esc(j.treatment)}</td></tr>`;
      });

      const el = document.getElementById('view-overview');
      el.innerHTML = `
        <div class="card">
          <div class="card-header">全体確認図 — ${esc(s.name || '')}</div>
          <div class="card-body">
            <div class="overview-grid">
              <div class="info-box">
                <h4>フーチング</h4>
                <table>
                  <tr><td>幅</td><td>${footing.width_mm || '-'}mm</td></tr>
                  <tr><td>奥行</td><td>${footing.depth_mm || '-'}mm</td></tr>
                  <tr><td>厚さ</td><td>${footing.thickness_mm || '-'}mm</td></tr>
                  <tr><td>つま先長</td><td>${footing.toe_length_mm || '-'}mm</td></tr>
                  <tr><td>踵長</td><td>${footing.heel_length_mm || '-'}mm</td></tr>
                  <tr><td>型枠固定</td><td>H鋼控え杭（セパなし）</td></tr>
                </table>
              </div>
              <div class="info-box">
                <h4>竪壁</h4>
                <table>
                  <tr><td>高さ</td><td>${stem.height_mm || '-'}mm</td></tr>
                  <tr><td>天端厚</td><td>${stem.thickness_top_mm || '-'}mm</td></tr>
                  <tr><td>基部厚</td><td>${stem.thickness_bottom_mm || '-'}mm</td></tr>
                  <tr><td>テーパー</td><td>${stem.taper ? 'あり' : 'なし'}</td></tr>
                  <tr><td>リフト高</td><td>${stem.lift_height_mm || '-'}mm</td></tr>
                  <tr><td>リフト数</td><td>${stem.lift_count || '-'}リフト</td></tr>
                </table>
              </div>
              <div class="info-box">
                <h4>パラペット</h4>
                <table>
                  <tr><td>高さ</td><td>${parapet.height_mm || '-'}mm</td></tr>
                  <tr><td>幅</td><td>${parapet.width_mm || '-'}mm</td></tr>
                  <tr><td>沓座幅</td><td>${parapet.bearing_seat?.width_mm || '-'}mm</td></tr>
                  <tr><td>沓座深さ</td><td>${parapet.bearing_seat?.depth_mm || '-'}mm</td></tr>
                  <tr><td>精度</td><td>±${parapet.bearing_seat?.level_tolerance_mm || '-'}mm</td></tr>
                </table>
              </div>
              <div class="info-box">
                <h4>翼壁</h4>
                <table>
                  <tr><td>タイプ</td><td>${esc(wingWall.type || '-')}</td></tr>
                  <tr><td>延長</td><td>${wingWall.length_mm || '-'}mm</td></tr>
                  <tr><td>高さ（始）</td><td>${wingWall.height_start_mm || '-'}mm</td></tr>
                  <tr><td>高さ（終）</td><td>${wingWall.height_end_mm || '-'}mm</td></tr>
                  <tr><td>壁厚</td><td>${wingWall.thickness_mm || '-'}mm</td></tr>
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
                <h4>打継目地</h4>
                <table>
                  <thead><tr><th>位置</th><th>処理</th></tr></thead>
                  <tbody>${jointRows}</tbody>
                </table>
                ${joints.note ? `<p style="font-size:11px;color:#666;margin-top:6px">${esc(joints.note)}</p>` : ''}
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
                <div class="card"><div class="card-header">断面図（側面図）</div><div class="card-body"><div class="diagram-container" id="crossSectionDiagram"></div></div></div>
              </div>
              ${noteHtml ? `<div class="full"><div class="info-box"><h4>注意事項</h4>${noteHtml}</div></div>` : ''}
            </div>
          </div>
        </div>`;

      this.renderCrossSection(data);
    },

    // ============================================================
    // Cross Section Diagram (側面図)
    // ============================================================
    renderCrossSection(data) {
      const s = data.structure;
      const footing = s.footing || {};
      const stem = s.stem || {};
      const parapet = s.parapet || {};
      const wingWall = s.wing_wall || {};

      const svgW = 620, svgH = 480;
      const marginL = 90, marginB = 50;

      // Scale to fit: total height = footing + stem + parapet
      const totalH = (footing.thickness_mm || 1500) + (stem.height_mm || 5000) + (parapet.height_mm || 800);
      const totalW = footing.depth_mm || 4000;
      const scH = (svgH - marginB - 40) / totalH;
      const scW = (svgW - marginL - 120) / Math.max(totalW, (wingWall.length_mm || 3000) + 500);
      const sc = Math.min(scH, scW, 0.065);

      // Base line Y (bottom of footing)
      const baseY = svgH - marginB;

      // Footing dimensions
      const fW = (footing.depth_mm || 4000) * sc;
      const fH = (footing.thickness_mm || 1500) * sc;
      const fToe = (footing.toe_length_mm || 1000) * sc;
      const fHeel = (footing.heel_length_mm || 2500) * sc;

      // Stem dimensions
      const sH = (stem.height_mm || 5000) * sc;
      const sTbot = (stem.thickness_bottom_mm || 1200) * sc;
      const sTop = (stem.thickness_top_mm || 800) * sc;
      const liftH = (stem.lift_height_mm || 2500) * sc;

      // Parapet dimensions
      const pH = (parapet.height_mm || 800) * sc;
      const pW = (parapet.width_mm || 1500) * sc;

      // Wing wall
      const wLen = (wingWall.length_mm || 3000) * sc;
      const wHstart = (wingWall.height_start_mm || 5000) * sc;
      const wHend = (wingWall.height_end_mm || 1500) * sc;
      const wThick = (wingWall.thickness_mm || 400) * sc;

      // Position: footing left edge
      const footLeft = marginL;
      const footRight = footLeft + fW;
      const footTop = baseY - fH;

      // Stem sits on footing (centered-ish, toe side to left)
      const stemLeft = footLeft + fToe;
      const stemRight = stemLeft + sTbot; // bottom width
      const stemTop = footTop - sH;
      const stemTopLeft = stemLeft + (sTbot - sTop) / 2; // taper
      const stemTopRight = stemTopLeft + sTop;

      // Parapet on top of stem
      const paraLeft = stemTopLeft + (sTop - pW) / 2;
      const paraRight = paraLeft + pW;
      const paraTop = stemTop - pH;

      let svg = `<svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg" style="font-family:'BIZ UDPGothic','Meiryo',sans-serif">`;

      // Ground line
      svg += `<line x1="0" y1="${baseY}" x2="${svgW}" y2="${baseY}" stroke="#8B4513" stroke-width="2" stroke-dasharray="8,4"/>`;
      svg += `<text x="10" y="${baseY + 14}" font-size="9" fill="#8B4513">G.L.</text>`;

      // ---- Footing (blue-tint) ----
      svg += `<rect x="${footLeft}" y="${footTop}" width="${fW}" height="${fH}" fill="#d6eaf8" stroke="#1a5276" stroke-width="1.5"/>`;
      svg += `<text x="${footLeft + fW / 2}" y="${footTop + fH / 2 + 4}" text-anchor="middle" font-size="10" fill="#1a5276" font-weight="bold">フーチング</text>`;

      // Face labels on footing
      svg += `<text x="${footLeft - 3}" y="${footTop + fH / 2}" text-anchor="end" font-size="8" fill="#e74c3c">F-C←</text>`;
      svg += `<text x="${footRight + 3}" y="${footTop + fH / 2}" text-anchor="start" font-size="8" fill="#e74c3c">→F-D</text>`;
      svg += `<text x="${footLeft + fToe / 2}" y="${footTop - 3}" text-anchor="middle" font-size="7" fill="#666">つま先</text>`;
      svg += `<text x="${stemRight + (footRight - stemRight) / 2}" y="${footTop - 3}" text-anchor="middle" font-size="7" fill="#666">踵</text>`;

      // F-A / F-B labels (front/back of footing = into/out of screen, show as text)
      svg += `<text x="${footLeft + fW / 2}" y="${baseY - 3}" text-anchor="middle" font-size="7" fill="#e74c3c">F-A(前面) / F-B(背面) : 紙面直交方向</text>`;

      // ---- Stem (green-tint, tapered) ----
      if (stem.taper) {
        const pts = `${stemLeft},${footTop} ${stemRight},${footTop} ${stemTopRight},${stemTop} ${stemTopLeft},${stemTop}`;
        svg += `<polygon points="${pts}" fill="#d5f5e3" stroke="#1e8449" stroke-width="1.5"/>`;
      } else {
        svg += `<rect x="${stemLeft}" y="${stemTop}" width="${sTbot}" height="${sH}" fill="#d5f5e3" stroke="#1e8449" stroke-width="1.5"/>`;
      }
      svg += `<text x="${(stemLeft + stemRight) / 2}" y="${footTop - sH / 2 + 4}" text-anchor="middle" font-size="10" fill="#1e8449" font-weight="bold">竪壁</text>`;

      // Lift division lines (dashed)
      const liftCount = stem.lift_count || 2;
      for (let i = 1; i < liftCount; i++) {
        const ly = footTop - liftH * i;
        // Calculate x at this height for tapered stem
        const ratio = (liftH * i) / sH;
        const lxLeft = stemLeft + (stemTopLeft - stemLeft) * ratio;
        const lxRight = stemRight + (stemTopRight - stemRight) * ratio;
        svg += `<line x1="${lxLeft}" y1="${ly}" x2="${lxRight}" y2="${ly}" stroke="#0000FF" stroke-width="1.5" stroke-dasharray="6,3"/>`;
        svg += `<text x="${lxRight + 5}" y="${ly + 3}" font-size="7" fill="#0000FF">打継(リフト${i}/${i + 1})</text>`;
      }

      // Face labels on stem
      svg += `<text x="${stemLeft - 3}" y="${footTop - sH / 2}" text-anchor="end" font-size="8" fill="#e74c3c">S-A→</text>`;
      svg += `<text x="${stemRight + 3}" y="${footTop - sH / 2}" text-anchor="start" font-size="8" fill="#e74c3c">←S-B</text>`;

      // ---- Parapet (orange-tint) ----
      svg += `<rect x="${paraLeft}" y="${paraTop}" width="${pW}" height="${pH}" fill="#fdebd0" stroke="#e67e22" stroke-width="1.5"/>`;
      svg += `<text x="${paraLeft + pW / 2}" y="${paraTop + pH / 2 + 4}" text-anchor="middle" font-size="9" fill="#e67e22" font-weight="bold">パラペット</text>`;
      svg += `<text x="${paraLeft - 3}" y="${paraTop + pH / 2}" text-anchor="end" font-size="8" fill="#e74c3c">P-A→</text>`;

      // Bearing seat symbol
      const bsW = (parapet.bearing_seat?.width_mm || 600) * sc;
      const bsD = (parapet.bearing_seat?.depth_mm || 400) * sc;
      const bsX = paraLeft + (pW - bsW) / 2;
      svg += `<rect x="${bsX}" y="${paraTop}" width="${bsW}" height="${bsD}" fill="none" stroke="#e74c3c" stroke-width="1" stroke-dasharray="3,2"/>`;
      svg += `<text x="${bsX + bsW / 2}" y="${paraTop - 3}" text-anchor="middle" font-size="7" fill="#e74c3c">沓座 ±${parapet.bearing_seat?.level_tolerance_mm || 2}mm</text>`;

      // Construction joint line: footing to stem
      svg += `<line x1="${stemLeft - 5}" y1="${footTop}" x2="${stemRight + 5}" y2="${footTop}" stroke="#0000FF" stroke-width="2" stroke-dasharray="6,3"/>`;

      // Construction joint line: stem to parapet
      svg += `<line x1="${stemTopLeft - 5}" y1="${stemTop}" x2="${stemTopRight + 5}" y2="${stemTop}" stroke="#0000FF" stroke-width="2" stroke-dasharray="6,3"/>`;

      // ---- Wing Wall (dashed outline, extending from stem side) ----
      // Shown as a trapezoid extending to the right from the stem
      const wStartX = footRight + 15;
      const wEndX = wStartX + wLen;
      const wTopStart = footTop - wHstart;
      const wTopEnd = footTop - wHend;

      svg += `<polygon points="${wStartX},${footTop} ${wEndX},${footTop} ${wEndX},${wTopEnd} ${wStartX},${wTopStart}" fill="#f9ebea" fill-opacity="0.5" stroke="#922B21" stroke-width="1.2" stroke-dasharray="5,3"/>`;
      svg += `<text x="${(wStartX + wEndX) / 2}" y="${footTop - (wHstart + wHend) / 4 + 4}" text-anchor="middle" font-size="9" fill="#922B21">翼壁</text>`;
      svg += `<text x="${(wStartX + wEndX) / 2}" y="${footTop - (wHstart + wHend) / 4 + 16}" text-anchor="middle" font-size="7" fill="#e74c3c">W-A / W-B</text>`;
      svg += `<text x="${(wStartX + wEndX) / 2}" y="${footTop - (wHstart + wHend) / 4 + 27}" text-anchor="middle" font-size="7" fill="#922B21">(テーパー)</text>`;

      // ---- Dimension Lines ----

      // Footing width (horizontal)
      const dimFootY = baseY + 18;
      svg += this._dimLine(footLeft, dimFootY, footRight, dimFootY, `${footing.depth_mm || 4000}mm`);

      // Toe length
      const dimToeY = baseY + 34;
      svg += this._dimLine(footLeft, dimToeY, footLeft + fToe, dimToeY, `${footing.toe_length_mm || 1000}`);

      // Heel length
      svg += this._dimLine(stemRight, dimToeY, footRight, dimToeY, `${footing.heel_length_mm || 2500}`);

      // Footing thickness (vertical)
      const dimFootVx = footLeft - 18;
      svg += this._dimLineV(dimFootVx, footTop, dimFootVx, baseY, `${footing.thickness_mm || 1500}`);

      // Stem height (vertical)
      const dimStemVx = footLeft - 50;
      svg += this._dimLineV(dimStemVx, stemTop, dimStemVx, footTop, `${stem.height_mm || 5000}`);

      // Parapet height (vertical)
      const dimParaVx = footLeft - 18;
      svg += this._dimLineV(dimParaVx, paraTop, dimParaVx, stemTop, `${parapet.height_mm || 800}`);

      // Total height
      const dimTotalVx = footLeft - 75;
      svg += this._dimLineV(dimTotalVx, paraTop, dimTotalVx, baseY, `${totalH}mm`);

      // Wing wall length
      const dimWingY = footTop + 14;
      svg += this._dimLine(wStartX, dimWingY, wEndX, dimWingY, `${wingWall.length_mm || 3000}`);

      // Stem thickness labels
      svg += `<text x="${(stemLeft + stemRight) / 2}" y="${footTop + 12}" text-anchor="middle" font-size="7" fill="#666">t=${stem.thickness_bottom_mm || 1200}</text>`;
      svg += `<text x="${(stemTopLeft + stemTopRight) / 2}" y="${stemTop + 12}" text-anchor="middle" font-size="7" fill="#666">t=${stem.thickness_top_mm || 800}</text>`;

      // Color legend
      svg += `<rect x="${svgW - 150}" y="10" width="140" height="95" fill="#fff" stroke="#ddd" stroke-width="0.5" rx="4"/>`;
      svg += `<text x="${svgW - 145}" y="24" font-size="9" fill="#333" font-weight="bold">凡例</text>`;
      svg += `<rect x="${svgW - 145}" y="30" width="12" height="10" fill="#d6eaf8" stroke="#1a5276" stroke-width="0.5"/>`;
      svg += `<text x="${svgW - 128}" y="39" font-size="8" fill="#333">フーチング</text>`;
      svg += `<rect x="${svgW - 145}" y="45" width="12" height="10" fill="#d5f5e3" stroke="#1e8449" stroke-width="0.5"/>`;
      svg += `<text x="${svgW - 128}" y="54" font-size="8" fill="#333">竪壁</text>`;
      svg += `<rect x="${svgW - 145}" y="60" width="12" height="10" fill="#fdebd0" stroke="#e67e22" stroke-width="0.5"/>`;
      svg += `<text x="${svgW - 128}" y="69" font-size="8" fill="#333">パラペット</text>`;
      svg += `<rect x="${svgW - 145}" y="75" width="12" height="10" fill="#f9ebea" fill-opacity="0.5" stroke="#922B21" stroke-width="0.5"/>`;
      svg += `<text x="${svgW - 128}" y="84" font-size="8" fill="#333">翼壁（破線）</text>`;
      svg += `<line x1="${svgW - 145}" y1="94" x2="${svgW - 133}" y2="94" stroke="#0000FF" stroke-width="1.5" stroke-dasharray="4,2"/>`;
      svg += `<text x="${svgW - 128}" y="97" font-size="8" fill="#333">打継目地</text>`;

      svg += `</svg>`;

      const el = document.getElementById('crossSectionDiagram');
      if (el) el.innerHTML = svg;
    },

    // Dimension line helpers (inline, avoid dependency issues)
    _dimLine(x1, y, x2, y2, label) {
      return dimLine(x1, y, x2, y2, label);
    },
    _dimLineV(x, y1, x2, y2, label) {
      return dimLineV(x, y1, x2, y2, label);
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
      const isFooting = face.id.startsWith('F');
      const isStem = face.id.startsWith('S');
      const isParapet = face.id.startsWith('P');
      const isWing = face.id.startsWith('W');

      let componentLabel = 'フーチング';
      let componentColor = '#1a5276';
      if (isStem) { componentLabel = '竪壁'; componentColor = '#1e8449'; }
      if (isParapet) { componentLabel = 'パラペット'; componentColor = '#e67e22'; }
      if (isWing) { componentLabel = '翼壁'; componentColor = '#922B21'; }

      const supportInfo = face.support
        ? `<tr><td>控え</td><td>${esc(face.support.type)} ${esc(face.support.spec || '')}</td></tr>`
        : '';

      container.innerHTML = `
        <div class="card">
          <div class="card-header">${esc(face.id)}面 — ${esc(face.name || '')}
            <span class="badge" style="background:${componentColor}">${componentLabel}</span>
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
                  <tr><td>仕上げ</td><td>${esc(face.finish || '-')}</td></tr>
                  ${supportInfo}
                </table>
              </div>
              <div class="info-box">
                <h4>セパレーター仕様</h4>
                ${sep.type ? `<table>
                  <tr><td>種類</td><td>${esc(sep.type || '-')} ${esc(sep.diameter || '')}</td></tr>
                  <tr><td>水平ピッチ</td><td>@${sep.pitch_h_mm || '-'}mm</td></tr>
                  <tr><td>垂直ピッチ</td><td>@${sep.pitch_v_mm || '-'}mm</td></tr>
                  <tr><td>段数</td><td>${sep.rows || '-'}段</td></tr>
                  ${sep.rows > 1 ? `<tr><td>段位置</td><td>${(sep.row_positions_mm || []).join(', ')}mm</td></tr>` : ''}
                  <tr><td>セパ長</td><td>${sep.length_mm || '-'}mm</td></tr>
                  <tr><td>本数</td><td>${sep.count || '-'}本</td></tr>
                  ${sep.note ? `<tr><td>備考</td><td style="color:#e74c3c">${esc(sep.note)}</td></tr>` : ''}
                </table>` : `<p style="font-size:12px;color:#999">セパレーターなし（控え杭で固定）</p>`}
              </div>
              ${isParapet ? `<div class="info-box full">
                <h4>沓座精度</h4>
                <p style="font-size:12px;color:#e74c3c;font-weight:bold">沓座レベル精度 ±${data.structure?.parapet?.bearing_seat?.level_tolerance_mm || 2}mm。アンカーボルト位置精度±5mm。</p>
              </div>` : ''}
              ${isWing && face.note ? `<div class="info-box full">
                <h4>翼壁注意</h4>
                <p style="font-size:12px;color:#922B21;font-weight:bold">${esc(face.note)}</p>
              </div>` : ''}
              ${isStem && sep.note ? `<div class="info-box full">
                <h4>セパ太径化注意</h4>
                <p style="font-size:12px;color:#e74c3c;font-weight:bold">${esc(sep.note)}</p>
              </div>` : ''}
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
      const isFooting = faceId.startsWith('F');
      const isStem = faceId.startsWith('S');
      const isWing = faceId.startsWith('W');

      // Determine if multi-row (footing panels have rows)
      const maxRow = panels.reduce((m, p) => Math.max(m, p.row || 1), 1);

      // Drawing area
      const marginL = 65, marginR = 60, marginT = 25, marginB = 90;
      const drawW = Math.max(500, Math.min(1100, panels.length * 70));
      const drawH = Math.max(150, Math.min(350, faceH * 0.08));
      const svgW = drawW + marginL + marginR;
      const svgH = drawH + marginT + marginB;
      const scaleX = drawW / faceW;
      const scaleY = drawH / faceH;

      let svg = `<svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg" style="font-family:'BIZ UDPGothic','Meiryo',sans-serif">`;

      // Background fill for face
      svg += `<rect x="${marginL}" y="${marginT}" width="${drawW}" height="${drawH}" fill="#fafafa" stroke="#ccc" stroke-width="0.5"/>`;

      // Draw panels
      if (showPanels) {
        if (maxRow > 1) {
          // Multi-row layout (footing faces)
          // Group panels by row
          const rowGroups = {};
          panels.forEach(p => {
            const r = p.row || 1;
            if (!rowGroups[r]) rowGroups[r] = [];
            rowGroups[r].push(p);
          });

          // Calculate row heights
          const rowHeights = {};
          Object.keys(rowGroups).forEach(r => {
            rowHeights[r] = rowGroups[r][0].height_mm || 900;
          });
          const totalPanelH = Object.values(rowHeights).reduce((s, h) => s + h, 0);

          let yOff = 0;
          for (let r = 1; r <= maxRow; r++) {
            const rowPanels = rowGroups[r] || [];
            const rowH = (rowHeights[r] || 900);
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
        } else {
          // Single row layout (stem, parapet, wing)
          let xOff = 0;
          panels.forEach(p => {
            const pw = p.width_mm * scaleX;
            const ph = drawH;
            const px = marginL + xOff;
            const py = marginT;
            const isCut = p.type === 'カット';
            svg += `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="${isCut ? '#FFF3B0' : '#fff'}" stroke="#888" stroke-width="0.8"/>`;

            if (pw > 20) {
              svg += `<text x="${px + pw / 2}" y="${py + 14}" text-anchor="middle" font-size="${pw > 40 ? 9 : 7}" fill="#333">${esc(p.id)}</text>`;
              if (pw > 45) {
                svg += `<text x="${px + pw / 2}" y="${py + 26}" text-anchor="middle" font-size="7" fill="#888">${p.orientation === '縦' ? '↑縦' : '→横'}</text>`;
              }
            }
            xOff += p.width_mm * scaleX;
          });
        }
      }

      // Separators
      if (showSeparators && sep.type) {
        const pitchH = sep.pitch_h_mm || 450;
        const edgeM = sep.edge_margin_mm || 200;
        const rowPositions = sep.row_positions_mm || [faceH / 2];

        for (let x = edgeM; x <= faceW - edgeM + 1; x += pitchH) {
          const sx = marginL + x * scaleX;
          rowPositions.forEach(ry => {
            const sy = marginT + (faceH - ry) * scaleY;
            svg += `<circle cx="${sx}" cy="${sy}" r="3.5" fill="none" stroke="#1a5276" stroke-width="1.2"/>`;
          });
        }
      }

      // Lift boundary line (for stem faces that are 2nd lift etc.)
      if (isStem && showDimensions) {
        // Show construction joint note at bottom
        svg += `<line x1="${marginL}" y1="${marginT + drawH}" x2="${marginL + drawW}" y2="${marginT + drawH}" stroke="#0000FF" stroke-width="1.5" stroke-dasharray="6,3"/>`;
        svg += `<text x="${marginL + drawW + 5}" y="${marginT + drawH + 3}" font-size="7" fill="#0000FF">打継目地</text>`;
      }

      // Joint lines (from JSON joints data)
      const jointsInfo = appData?.structure?.joints;
      if (jointsInfo && showDimensions) {
        // Expansion joints - red double vertical lines
        const expJoints = jointsInfo.expansion_joints || [];
        expJoints.forEach(j => {
          if (j.position_mm === undefined) return;
          const jx = marginL + j.position_mm * scaleX;
          svg += `<line x1="${jx - 1}" y1="${marginT - 5}" x2="${jx - 1}" y2="${marginT + drawH + 5}" stroke="#FF0000" stroke-width="2"/>`;
          svg += `<line x1="${jx + 1}" y1="${marginT - 5}" x2="${jx + 1}" y2="${marginT + drawH + 5}" stroke="#FF0000" stroke-width="2"/>`;
          svg += `<text x="${jx}" y="${marginT - 8}" text-anchor="middle" font-size="8" fill="#FF0000">伸縮目地</text>`;
        });
      }

      // Footing support note
      if (isFooting && showDimensions) {
        svg += `<text x="${marginL + drawW / 2}" y="${marginT - 5}" text-anchor="middle" font-size="8" fill="#1a5276" font-weight="bold">※ セパなし — H鋼控え杭で固定</text>`;
      }

      // Wing taper note
      if (isWing && showDimensions) {
        // Draw taper line (diagonal line from top-left to lower-right)
        const wHstart = appData?.structure?.wing_wall?.height_start_mm || 5000;
        const wHend = appData?.structure?.wing_wall?.height_end_mm || 1500;
        const taperEndY = marginT + (1 - wHend / wHstart) * drawH;
        svg += `<line x1="${marginL}" y1="${marginT}" x2="${marginL + drawW}" y2="${taperEndY}" stroke="#922B21" stroke-width="1.5" stroke-dasharray="5,3"/>`;
        svg += `<text x="${marginL + drawW / 2}" y="${marginT - 5}" text-anchor="middle" font-size="8" fill="#922B21">↗ テーパー: ${wHstart}mm → ${wHend}mm</text>`;
      }

      // Dimensions
      if (showDimensions) {
        const dimY1 = marginT + drawH + 16;
        const dimY2 = dimY1 + 22;

        // Total width
        svg += dimLine(marginL, dimY1, marginL + drawW, dimY1, `${faceW.toLocaleString()}mm`);

        // Panel widths (single row only, avoid clutter for multi-row)
        if (maxRow <= 1 && panels.length <= 15) {
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
          const edgeM = sep.edge_margin_mm || 200;
          const ex1 = marginL;
          const ex2 = marginL + edgeM * scaleX;
          if (ex2 - ex1 > 12) {
            svg += `<text x="${(ex1 + ex2) / 2}" y="${dimY3}" text-anchor="middle" font-size="8" fill="#666">あき ${edgeM}mm</text>`;
          }
          svg += `<text x="${marginL + drawW / 2}" y="${dimY3}" text-anchor="middle" font-size="9" fill="#1a5276">@${sep.pitch_h_mm}（セパピッチ）</text>`;
        }

        // Height dimension (vertical)
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
    // 3D View
    // ============================================================
    build3D(data, scene) {
      const s = data.structure;
      const footing = s.footing || {};
      const stem = s.stem || {};
      const parapet = s.parapet || {};
      const wingWall = s.wing_wall || {};

      // Dimensions
      const fW = footing.width_mm || 6000;     // X direction
      const fD = footing.depth_mm || 4000;      // Z direction
      const fH = footing.thickness_mm || 1500;   // Y direction
      const sTbot = stem.thickness_bottom_mm || 1200;
      const sTop = stem.thickness_top_mm || 800;
      const sH = stem.height_mm || 5000;
      const liftH = stem.lift_height_mm || 2500;
      const liftCount = stem.lift_count || 2;
      const pWid = parapet.width_mm || 1500;
      const pHt = parapet.height_mm || 800;
      const wLen = wingWall.length_mm || 3000;
      const wThk = wingWall.thickness_mm || 400;
      const toeMm = footing.toe_length_mm || 1000;
      const heelMm = footing.heel_length_mm || 2500;

      // Camera
      set3DCameraTarget(fW / 2, (fH + sH + pHt) / 2, fD / 2, Math.max(fW, fD, sH) * 1.2);

      // Face data helper
      const ff = id => {
        for (const ph of (data.phases || [])) {
          for (const f of (ph.faces || [])) {
            if (f.id === id) return f;
          }
        }
        return { id, name: id, panels: [], separators: null };
      };

      // ---- Ground reference ----
      const groundGeo = new THREE.PlaneGeometry(fW + 4000, fD + 4000);
      const groundMat = new THREE.MeshLambertMaterial({ color: 0x8B7355, transparent: true, opacity: 0.3 });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(fW / 2, -10, fD / 2);
      scene.add(ground);

      // ---- Footing concrete (translucent) ----
      const footGeo = new THREE.BoxGeometry(fW, fH, fD);
      const footMat = new THREE.MeshLambertMaterial({ color: 0xd6eaf8, transparent: true, opacity: 0.25 });
      const footMesh = new THREE.Mesh(footGeo, footMat);
      footMesh.position.set(fW / 2, fH / 2, fD / 2);
      scene.add(footMesh);

      // ---- Footing formwork faces ----
      const faFace = ff('F-A');
      const fbFace = ff('F-B');
      const fcFace = ff('F-C');
      const fdFace = ff('F-D');

      const faMesh = createFaceMesh(faFace, fW, fH);
      const fbMesh = createFaceMesh(fbFace, fW, fH);
      const fcMesh = createFaceMesh(fcFace, fD, fH);
      const fdMesh = createFaceMesh(fdFace, fD, fH);

      [faMesh, fbMesh, fcMesh, fdMesh].forEach(m => scene.add(m));

      // ---- Stem concrete (translucent, tapered) ----
      // Use a custom geometry for tapered stem
      const stemBaseY = fH;
      const stemTopY = fH + sH;
      const stemZ0 = toeMm; // stem starts at toe offset in Z
      // Bottom: sTbot wide, Top: sTop wide (centered)
      const stemZcenter = stemZ0 + sTbot / 2;
      const stemGeo = new THREE.BoxGeometry(fW, sH, (sTbot + sTop) / 2);
      const stemMat = new THREE.MeshLambertMaterial({ color: 0xd5f5e3, transparent: true, opacity: 0.2 });
      const stemMesh = new THREE.Mesh(stemGeo, stemMat);
      stemMesh.position.set(fW / 2, stemBaseY + sH / 2, stemZcenter);
      scene.add(stemMesh);

      // ---- Stem formwork faces ----
      const saFace = ff('S-A');
      const sbFace = ff('S-B');
      const sa2Face = ff('S-A2');
      const sb2Face = ff('S-B2');

      // Lift 1 faces
      const saMesh1 = createFaceMesh(saFace, fW, liftH);
      const sbMesh1 = createFaceMesh(sbFace, fW, liftH);
      // Lift 2 faces
      const saMesh2 = createFaceMesh(sa2Face, fW, liftH);
      const sbMesh2 = createFaceMesh(sb2Face, fW, liftH);

      [saMesh1, sbMesh1, saMesh2, sbMesh2].forEach(m => scene.add(m));

      // ---- Parapet formwork ----
      const paFace = ff('P-A');
      const paMesh = createFaceMesh(paFace, pWid, pHt);
      scene.add(paMesh);

      // ---- Wing wall formwork ----
      const wHstart = wingWall.height_start_mm || 5000;
      const wHend = wingWall.height_end_mm || 1500;

      const waFace = ff('W-A');
      const wbFace = ff('W-B');
      const waMesh = createFaceMesh(waFace, wLen, wHstart);
      const wbMesh = createFaceMesh(wbFace, wLen, wHstart);
      [waMesh, wbMesh].forEach(m => scene.add(m));

      // Wing wall concrete volume (translucent)
      const wwGeo = new THREE.BoxGeometry(wLen, wHstart, wThk);
      const wwMat = new THREE.MeshLambertMaterial({ color: 0xf5cba7, transparent: true, opacity: 0.2 });
      const wwMeshR = new THREE.Mesh(wwGeo, wwMat);
      wwMeshR.position.set(fW + wLen / 2, fH + wHstart / 2, stemZcenter);
      scene.add(wwMeshR);

      // Wing wall edge lines (red-brown)
      const wwEdgeMat = new THREE.LineBasicMaterial({ color: 0x922B21 });
      const wwY0 = fH, wwY1 = fH + wHstart;
      const wwZ0 = stemZcenter - wThk / 2, wwZ1 = stemZcenter + wThk / 2;
      // Bottom rect
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(fW, wwY0, wwZ0), new THREE.Vector3(fW + wLen, wwY0, wwZ0),
        new THREE.Vector3(fW + wLen, wwY0, wwZ1), new THREE.Vector3(fW, wwY0, wwZ1),
        new THREE.Vector3(fW, wwY0, wwZ0)
      ]), wwEdgeMat));
      // Top rect
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(fW, wwY1, wwZ0), new THREE.Vector3(fW + wLen, wwY1, wwZ0),
        new THREE.Vector3(fW + wLen, wwY1, wwZ1), new THREE.Vector3(fW, wwY1, wwZ1),
        new THREE.Vector3(fW, wwY1, wwZ0)
      ]), wwEdgeMat));
      // Vertical edges
      [[fW, wwZ0], [fW, wwZ1], [fW + wLen, wwZ0], [fW + wLen, wwZ1]].forEach(([x, z]) => {
        scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(x, wwY0, z), new THREE.Vector3(x, wwY1, z)
        ]), wwEdgeMat));
      });

      // ---- Construction joint lines (blue) ----
      const jointLineMat = new THREE.LineBasicMaterial({ color: 0x0000FF });

      // Footing to stem joint
      const jy1 = fH;
      const j1pts = [
        new THREE.Vector3(0, jy1, stemZ0),
        new THREE.Vector3(fW, jy1, stemZ0),
        new THREE.Vector3(fW, jy1, stemZ0 + sTbot),
        new THREE.Vector3(0, jy1, stemZ0 + sTbot),
        new THREE.Vector3(0, jy1, stemZ0),
      ];
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(j1pts), jointLineMat));

      // Lift 1 to Lift 2 joint
      const jy2 = fH + liftH;
      const j2pts = [
        new THREE.Vector3(0, jy2, stemZ0),
        new THREE.Vector3(fW, jy2, stemZ0),
        new THREE.Vector3(fW, jy2, stemZ0 + sTbot),
        new THREE.Vector3(0, jy2, stemZ0 + sTbot),
        new THREE.Vector3(0, jy2, stemZ0),
      ];
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(j2pts), jointLineMat));

      // Stem to parapet joint
      const jy3 = fH + sH;
      const stemTopZ0 = stemZcenter - sTop / 2;
      const j3pts = [
        new THREE.Vector3(fW / 2 - pWid / 2, jy3, stemTopZ0),
        new THREE.Vector3(fW / 2 + pWid / 2, jy3, stemTopZ0),
        new THREE.Vector3(fW / 2 + pWid / 2, jy3, stemTopZ0 + sTop),
        new THREE.Vector3(fW / 2 - pWid / 2, jy3, stemTopZ0 + sTop),
        new THREE.Vector3(fW / 2 - pWid / 2, jy3, stemTopZ0),
      ];
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(j3pts), jointLineMat));

      // ---- Construction joint translucent planes ----
      const jointPlaneMat = new THREE.MeshLambertMaterial({ color: 0x3366cc, transparent: true, opacity: 0.15, side: THREE.DoubleSide });
      // Plane at footing-to-stem joint
      const jp1Geo = new THREE.PlaneGeometry(fW, sTbot);
      const jp1 = new THREE.Mesh(jp1Geo, jointPlaneMat);
      jp1.rotation.x = -Math.PI / 2;
      jp1.position.set(fW / 2, jy1, stemZ0 + sTbot / 2);
      scene.add(jp1);
      // Plane at lift1-to-lift2 joint
      const jp2Geo = new THREE.PlaneGeometry(fW, sTbot);
      const jp2 = new THREE.Mesh(jp2Geo, jointPlaneMat);
      jp2.rotation.x = -Math.PI / 2;
      jp2.position.set(fW / 2, jy2, stemZ0 + sTbot / 2);
      scene.add(jp2);
      // Plane at stem-to-parapet joint
      const jp3Geo = new THREE.PlaneGeometry(pWid, sTop);
      const jp3 = new THREE.Mesh(jp3Geo, jointPlaneMat);
      jp3.rotation.x = -Math.PI / 2;
      jp3.position.set(fW / 2, jy3, stemTopZ0 + sTop / 2);
      scene.add(jp3);

      // ---- Edge lines for footing ----
      const edgeMat = new THREE.LineBasicMaterial({ color: 0x8B6914 });
      const footEdge = [
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(fW, 0, 0),
        new THREE.Vector3(fW, 0, fD), new THREE.Vector3(0, 0, fD), new THREE.Vector3(0, 0, 0),
      ];
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(footEdge), edgeMat));
      const footEdgeTop = footEdge.map(p => new THREE.Vector3(p.x, fH, p.z));
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(footEdgeTop), edgeMat));

      // ---- Assembled positions (folded) and flat layout (unfolded) ----
      const faces3D = [
        // Footing front (Z=0 face, along X)
        {
          mesh: faMesh,
          folded: { pos: [fW / 2, fH / 2, 0], rot: [0, Math.PI, 0] },
          unfolded: { pos: [fW / 2, 0, -fH / 2 - 200], rot: [-Math.PI / 2, 0, 0] }
        },
        // Footing back (Z=fD face)
        {
          mesh: fbMesh,
          folded: { pos: [fW / 2, fH / 2, fD], rot: [0, 0, 0] },
          unfolded: { pos: [fW / 2, 0, fD + fH / 2 + 200], rot: [-Math.PI / 2, 0, 0] }
        },
        // Footing left (X=0 face, along Z)
        {
          mesh: fcMesh,
          folded: { pos: [0, fH / 2, fD / 2], rot: [0, -Math.PI / 2, 0] },
          unfolded: { pos: [-fD / 2 - 200, 0, fD / 2], rot: [-Math.PI / 2, 0, 0] }
        },
        // Footing right (X=fW face)
        {
          mesh: fdMesh,
          folded: { pos: [fW, fH / 2, fD / 2], rot: [0, Math.PI / 2, 0] },
          unfolded: { pos: [fW + fD / 2 + 200, 0, fD / 2], rot: [-Math.PI / 2, 0, 0] }
        },
        // Stem front lift 1 (Z = stemZ0)
        {
          mesh: saMesh1,
          folded: { pos: [fW / 2, fH + liftH / 2, stemZ0], rot: [0, Math.PI, 0] },
          unfolded: { pos: [fW / 2, 0, -fH - liftH / 2 - 400], rot: [-Math.PI / 2, 0, 0] }
        },
        // Stem back lift 1
        {
          mesh: sbMesh1,
          folded: { pos: [fW / 2, fH + liftH / 2, stemZ0 + sTbot], rot: [0, 0, 0] },
          unfolded: { pos: [fW / 2, 0, fD + fH + liftH / 2 + 400], rot: [-Math.PI / 2, 0, 0] }
        },
        // Stem front lift 2
        {
          mesh: saMesh2,
          folded: { pos: [fW / 2, fH + liftH + liftH / 2, stemZ0], rot: [0, Math.PI, 0] },
          unfolded: { pos: [fW / 2, 0, -fH - liftH - liftH / 2 - 600], rot: [-Math.PI / 2, 0, 0] }
        },
        // Stem back lift 2
        {
          mesh: sbMesh2,
          folded: { pos: [fW / 2, fH + liftH + liftH / 2, stemZ0 + sTbot], rot: [0, 0, 0] },
          unfolded: { pos: [fW / 2, 0, fD + fH + liftH + liftH / 2 + 600], rot: [-Math.PI / 2, 0, 0] }
        },
        // Parapet front
        {
          mesh: paMesh,
          folded: { pos: [fW / 2, fH + sH + pHt / 2, stemZcenter - sTop / 2], rot: [0, Math.PI, 0] },
          unfolded: { pos: [fW / 2, 0, -fH - sH - pHt / 2 - 800], rot: [-Math.PI / 2, 0, 0] }
        },
        // Wing wall front (extends from X=fW side, perpendicular to stem)
        {
          mesh: waMesh,
          folded: { pos: [fW + wLen / 2, fH + wHstart / 2, stemZcenter - wThk / 2], rot: [0, Math.PI, 0] },
          unfolded: { pos: [fW + wLen / 2 + 400, 0, -fH / 2 - 200], rot: [-Math.PI / 2, 0, 0] }
        },
        // Wing wall back
        {
          mesh: wbMesh,
          folded: { pos: [fW + wLen / 2, fH + wHstart / 2, stemZcenter + wThk / 2], rot: [0, 0, 0] },
          unfolded: { pos: [fW + wLen / 2 + 400, 0, fD + fH / 2 + 200], rot: [-Math.PI / 2, 0, 0] }
        }
      ];

      // Set initial state (folded)
      faces3D.forEach(f => {
        f.mesh.position.set(...f.folded.pos);
        f.mesh.rotation.set(...f.folded.rot);
      });

      // Register for fold/unfold animation
      register3DFaces(faces3D);
    },

    // ============================================================
    // PDF Export
    // ============================================================
    exportPDF(data) {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
      const pw = 420, ph = 297, m = 15;

      // Page 1: Overview + Cross Section
      pdfDrawHeaderFooter(doc, '橋台 全体確認図', 1, 3);
      const s = data.structure;
      const footing = s.footing || {};
      const stem = s.stem || {};
      const parapet = s.parapet || {};
      const wingWall = s.wing_wall || {};
      let y = m + 35;
      doc.setFontSize(9);
      doc.setTextColor(0);
      doc.text(`構造物: ${s.name || '-'}（${s.subtype || '-'}）`, m + 10, y); y += 7;
      doc.text(`フーチング: ${footing.width_mm || '-'}×${footing.depth_mm || '-'}×${footing.thickness_mm || '-'}mm`, m + 10, y); y += 7;
      doc.text(`竪壁: H${stem.height_mm || '-'}mm、天端${stem.thickness_top_mm || '-'}mm / 基部${stem.thickness_bottom_mm || '-'}mm、${stem.lift_count || '-'}リフト`, m + 10, y); y += 7;
      doc.text(`パラペット: ${parapet.width_mm || '-'}×H${parapet.height_mm || '-'}mm、沓座精度±${parapet.bearing_seat?.level_tolerance_mm || '-'}mm`, m + 10, y); y += 7;
      doc.text(`翼壁: L${wingWall.length_mm || '-'}mm、H${wingWall.height_start_mm || '-'}→${wingWall.height_end_mm || '-'}mm`, m + 10, y); y += 10;

      // Notes
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
      pdfDrawHeaderFooter(doc, '各面割付図', 2, 3);
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
            doc.text(`  ${face.id}面: ${face.name} — ${face.width_mm ? (face.width_mm / 1000).toFixed(1) + 'm' : '-'} × ${face.height_mm || '-'}mm — パネル${face.panels?.length || 0}枚 — セパ${sep.count || 0}本(${sep.type || '-'})`, m + 10, y);
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

      const filename = `${data.project?.name || 'abutment'}_型枠割付_${data.project?.created_at || 'draft'}.pdf`;
      doc.save(filename);
    }
  };

  registerModule('abutment', AbutmentModule);
})();
