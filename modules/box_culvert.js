// ============================================================
// 型知 KATACHI — BOXカルバートモジュール (box_culvert.js)
// ============================================================

(function() {
  const BoxCulvertModule = {
    type: 'box_culvert',
    label: 'BOXカルバート',

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
        if (face) {
          this.renderFaceDiagram(faceId, face);
        }
      }
    },

    // ============================================================
    // Overview
    // ============================================================
    buildOverview(data) {
      const s = data.structure;
      const dim = s.dimensions || {};
      const cj = s.construction_joint || {};
      const joints = s.joints || {};
      const conJoints = joints.construction_joints || [];
      const shoring = s.shoring?.top_slab || {};

      // Load calculation for shoring
      const topSlabThickM = (dim.top_slab_thickness_mm || 400) / 1000;
      const loadCo = 24 * topSlabThickM;
      const loadFormwork = 0.4;
      const loadWork = 1.5;
      const loadImpact = 1.0;
      const loadTotal = loadCo + loadFormwork + loadWork + loadImpact;

      // Face summary table
      let faceSummary = '';
      if (data.phases) {
        data.phases.forEach(ph => {
          (ph.faces || []).forEach(f => {
            const w = f.width_mm ? (f.width_mm / 1000).toFixed(1) + 'm' : '-';
            const h = f.height_mm ? f.height_mm + 'mm' : '-';
            const pc = f.panels ? f.panels.length : '-';
            const sc = f.separators ? f.separators.count || '-' : '-';
            const sepType = f.separators ? f.separators.type : 'なし';
            const sepMark = f.separators ? (f.separators.type === 'B型' ? '●' : '○') : '-';
            faceSummary += `<tr><td>${esc(f.id)}</td><td>${esc(f.name || '')}</td><td>${w} × ${h}</td><td class="num">${pc}</td><td class="num">${sc}</td><td>${sepMark} ${esc(sepType)}</td></tr>`;
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
          const faceIds = (ph.faces || []).map(f => f.id).join(', ');
          phaseRows += `<tr><td>Phase ${ph.phase}</td><td>${esc(ph.name)}</td><td class="num">${faceCount}面</td><td style="font-size:11px;color:#666">${esc(faceIds)}</td></tr>`;
        });
      }

      // Expansion joint info
      const expJoint = cj.expansion_joint || {};
      const baseWall = cj.base_to_wall || {};

      const el = document.getElementById('view-overview');
      el.innerHTML = `
        <div class="card">
          <div class="card-header">全体確認図 — ${esc(s.name || '')}</div>
          <div class="card-body">
            <div class="overview-grid">
              <div class="info-box">
                <h4>寸法情報</h4>
                <table>
                  <tr><td>内空幅</td><td>${dim.inner_width_mm || '-'}mm</td></tr>
                  <tr><td>内空高</td><td>${dim.inner_height_mm || '-'}mm</td></tr>
                  <tr><td>頂版厚</td><td>${dim.top_slab_thickness_mm || '-'}mm</td></tr>
                  <tr><td>底版厚</td><td>${dim.bottom_slab_thickness_mm || '-'}mm</td></tr>
                  <tr><td>側壁厚</td><td>${dim.wall_thickness_mm || '-'}mm</td></tr>
                  <tr><td>ハンチ</td><td>${dim.haunch_size_mm || '-'}mm</td></tr>
                  <tr><td>スパン長</td><td>${dim.span_length_mm || '-'}mm</td></tr>
                  <tr><td>スパン数</td><td>${dim.span_count || 1}</td></tr>
                  <tr style="font-weight:bold;background:#e8f0fe"><td>外形寸法</td><td>${(dim.inner_width_mm || 0) + 2 * (dim.wall_thickness_mm || 0)}mm × ${(dim.inner_height_mm || 0) + (dim.top_slab_thickness_mm || 0) + (dim.bottom_slab_thickness_mm || 0)}mm</td></tr>
                </table>
              </div>
              <div class="info-box">
                <h4>打設計画</h4>
                <table>
                  <tr><td>打設方法</td><td style="font-weight:bold;color:#1a5276">${esc(s.casting_method || '-')}</td></tr>
                  <tr><td>Phase 1</td><td>底版コンクリート</td></tr>
                  <tr><td>Phase 2</td><td>${s.casting_method === '3回打設' ? '側壁コンクリート' : '側壁＋頂版同時打設'}</td></tr>
                  ${s.casting_method === '3回打設' ? '<tr><td>Phase 3</td><td>頂版コンクリート</td></tr>' : ''}
                </table>
                <table style="margin-top:8px">
                  <thead><tr><th></th><th>フェーズ名</th><th>面数</th><th>面ID</th></tr></thead>
                  <tbody>${phaseRows}</tbody>
                </table>
              </div>
              <div class="info-box">
                <h4>支保工情報（頂版）</h4>
                <table>
                  <tr><td>支保工種別</td><td>${esc(shoring.type === 'pipe_support' ? 'パイプサポート' : (shoring.type || '-'))}</td></tr>
                  <tr><td>支柱間隔</td><td>@${shoring.spacing_mm || '-'}mm</td></tr>
                  <tr><td>大引</td><td>${esc(shoring.girder || '-')}</td></tr>
                  <tr><td>根太</td><td>${esc(shoring.joist || '-')}（@${shoring.joist_spacing_mm || '-'}mm）</td></tr>
                </table>
                <div style="margin-top:8px;padding:8px;background:#fff3cd;border-radius:4px;font-size:11px">
                  <strong>荷重計算</strong><br>
                  Co（コンクリート）= 24 × ${topSlabThickM.toFixed(2)}m = <strong>${loadCo.toFixed(1)} kN/m2</strong><br>
                  型枠自重 = ${loadFormwork} kN/m2<br>
                  作業荷重 = ${loadWork} kN/m2<br>
                  衝撃荷重 = ${loadImpact} kN/m2<br>
                  <strong>合計 = ${loadTotal.toFixed(1)} kN/m2</strong>
                </div>
              </div>
              <div class="info-box">
                <h4>打継ぎ・目地</h4>
                <table>
                  <tr><td>底版〜側壁</td><td>${baseWall.waterstop ? '止水板あり' : '止水板なし'}（${esc(baseWall.type || '-')}）</td></tr>
                  <tr><td>伸縮目地</td><td>@${expJoint.interval_mm || '-'}mm</td></tr>
                  <tr><td>目地材</td><td>${esc(expJoint.material || '-')}</td></tr>
                  <tr><td>止水板</td><td>${esc(expJoint.waterstop || '-')}</td></tr>
                </table>
                <table style="margin-top:8px">
                  <tr><td>かぶり（土）</td><td>${s.cover?.soil_contact_mm || '-'}mm</td></tr>
                  <tr><td>かぶり（水）</td><td>${s.cover?.water_contact_mm || '-'}mm</td></tr>
                </table>
              </div>
              <div class="info-box">
                <h4>目地</h4>
                <table>
                  <tr><td>伸縮目地間隔</td><td>@${joints.expansion_joint_interval_mm || cj.expansion_joint?.interval_mm || '-'}mm</td></tr>
                  <tr><td>目地材</td><td>${esc(joints.expansion_joint_material || cj.expansion_joint?.material || '-')}</td></tr>
                  <tr><td>打継目地</td><td>${conJoints.length}箇所</td></tr>
                  ${conJoints.map(j => '<tr><td>\u3000' + esc(j.position) + '</td><td>' + esc(j.treatment||'') + '</td></tr>').join('')}
                  <tr><td>底版→壁 止水板</td><td>${cj.base_to_wall?.waterstop ? esc(cj.base_to_wall.type||'あり') : 'なし'}</td></tr>
                  <tr><td>備考</td><td>${esc(joints.note||'')}</td></tr>
                </table>
              </div>
              <div class="full">
                <div class="info-box">
                  <h4>面一覧</h4>
                  <table class="qty-table">
                    <thead><tr><th>面ID</th><th>面名</th><th>寸法</th><th>パネル数</th><th>セパ数</th><th>セパ種別</th></tr></thead>
                    <tbody>${faceSummary}</tbody>
                  </table>
                </div>
              </div>
              <div class="full" id="overviewCrossSection">
                <div class="card"><div class="card-header">横断面図</div><div class="card-body"><div class="diagram-container" id="crossSectionDiagram" style="min-height:450px"></div></div></div>
              </div>
              ${noteHtml ? `<div class="full"><div class="info-box"><h4>注意事項</h4>${noteHtml}</div></div>` : ''}
            </div>
          </div>
        </div>`;

      this.renderCrossSection(data);
    },

    // ============================================================
    // Cross Section Diagram (横断面図)
    // ============================================================
    renderCrossSection(data) {
      const s = data.structure;
      const dim = s.dimensions || {};

      const iW = dim.inner_width_mm || 3000;
      const iH = dim.inner_height_mm || 3000;
      const tTop = dim.top_slab_thickness_mm || 400;
      const tBot = dim.bottom_slab_thickness_mm || 500;
      const tWall = dim.wall_thickness_mm || 400;
      const haunch = dim.haunch_size_mm || 200;
      const shoring = s.shoring?.top_slab || {};
      const shoringSpacing = shoring.spacing_mm || 900;

      // Total outer dimensions
      const outerW = iW + 2 * tWall;
      const outerH = iH + tTop + tBot;

      // SVG sizing
      const svgW = 720, svgH = 520;
      const marginL = 100, marginR = 80, marginT = 50, marginB = 70;
      const drawW = svgW - marginL - marginR;
      const drawH = svgH - marginT - marginB;

      // Scale
      const scX = drawW / outerW;
      const scY = drawH / outerH;
      const sc = Math.min(scX, scY) * 0.85;

      // Center offset
      const boxDrawW = outerW * sc;
      const boxDrawH = outerH * sc;
      const offX = marginL + (drawW - boxDrawW) / 2;
      const offY = marginT + (drawH - boxDrawH) / 2;

      // Helper: mm -> pixel
      const px = (mm) => mm * sc;

      // Corners of outer box
      const oL = offX;
      const oR = offX + px(outerW);
      const oT = offY;
      const oB = offY + px(outerH);

      // Inner space corners
      const inL = oL + px(tWall);
      const inR = oR - px(tWall);
      const inT = oT + px(tTop);
      const inB = oB - px(tBot);

      let svg = `<svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg" style="font-family:'BIZ UDPGothic','Meiryo',sans-serif">`;

      // Title
      svg += `<text x="${svgW / 2}" y="20" text-anchor="middle" font-size="14" fill="#1a5276" font-weight="bold">BOXカルバート 横断面図</text>`;
      svg += `<text x="${svgW / 2}" y="36" text-anchor="middle" font-size="10" fill="#666">内空 ${iW}×${iH}mm ／ 外形 ${outerW}×${outerH}mm</text>`;

      // ---- Bottom slab (blue) ----
      svg += `<rect x="${oL}" y="${inB}" width="${px(outerW)}" height="${px(tBot)}" fill="#d6eaf8" stroke="#1a5276" stroke-width="1.5"/>`;
      svg += `<text x="${(oL + oR) / 2}" y="${inB + px(tBot) / 2 + 4}" text-anchor="middle" font-size="10" fill="#1a5276" font-weight="bold">底版 t=${tBot}</text>`;

      // ---- Left wall (green) ----
      svg += `<rect x="${oL}" y="${inT}" width="${px(tWall)}" height="${px(iH)}" fill="#d5f5e3" stroke="#1e8449" stroke-width="1.5"/>`;
      svg += `<text x="${oL + px(tWall) / 2}" y="${(inT + inB) / 2}" text-anchor="middle" font-size="9" fill="#1e8449" font-weight="bold" transform="rotate(-90,${oL + px(tWall) / 2},${(inT + inB) / 2})">左側壁 t=${tWall}</text>`;

      // ---- Right wall (green) ----
      svg += `<rect x="${inR}" y="${inT}" width="${px(tWall)}" height="${px(iH)}" fill="#d5f5e3" stroke="#1e8449" stroke-width="1.5"/>`;
      svg += `<text x="${inR + px(tWall) / 2}" y="${(inT + inB) / 2}" text-anchor="middle" font-size="9" fill="#1e8449" font-weight="bold" transform="rotate(90,${inR + px(tWall) / 2},${(inT + inB) / 2})">右側壁 t=${tWall}</text>`;

      // ---- Top slab (orange) ----
      svg += `<rect x="${oL}" y="${oT}" width="${px(outerW)}" height="${px(tTop)}" fill="#fdebd0" stroke="#e67e22" stroke-width="1.5"/>`;
      svg += `<text x="${(oL + oR) / 2}" y="${oT + px(tTop) / 2 + 4}" text-anchor="middle" font-size="10" fill="#e67e22" font-weight="bold">頂版 t=${tTop}</text>`;

      // ---- Inner space ----
      svg += `<rect x="${inL}" y="${inT}" width="${px(iW)}" height="${px(iH)}" fill="#f0f8ff" stroke="#999" stroke-width="0.5" stroke-dasharray="4,2"/>`;
      svg += `<text x="${(inL + inR) / 2}" y="${(inT + inB) / 2 - 8}" text-anchor="middle" font-size="13" fill="#333" font-weight="bold">内空</text>`;
      svg += `<text x="${(inL + inR) / 2}" y="${(inT + inB) / 2 + 8}" text-anchor="middle" font-size="11" fill="#666">${iW} × ${iH}mm</text>`;

      // ---- Haunches (4 corners, gray triangles) ----
      const hPx = px(haunch);
      // Bottom-left haunch
      svg += `<polygon points="${inL},${inB} ${inL + hPx},${inB} ${inL},${inB - hPx}" fill="#ccc" stroke="#999" stroke-width="0.8"/>`;
      // Bottom-right haunch
      svg += `<polygon points="${inR},${inB} ${inR - hPx},${inB} ${inR},${inB - hPx}" fill="#ccc" stroke="#999" stroke-width="0.8"/>`;
      // Top-left haunch
      svg += `<polygon points="${inL},${inT} ${inL + hPx},${inT} ${inL},${inT + hPx}" fill="#ccc" stroke="#999" stroke-width="0.8"/>`;
      // Top-right haunch
      svg += `<polygon points="${inR},${inT} ${inR - hPx},${inT} ${inR},${inT + hPx}" fill="#ccc" stroke="#999" stroke-width="0.8"/>`;
      // Haunch label
      svg += `<text x="${inL + hPx + 3}" y="${inB - hPx + 12}" font-size="7" fill="#666">H${haunch}</text>`;

      // ---- Pipe support lines (dotted, inside inner space) ----
      const supportCount = Math.floor(px(iW) / px(shoringSpacing));
      for (let i = 1; i <= supportCount; i++) {
        const sx = inL + i * px(shoringSpacing);
        if (sx < inR - 5) {
          svg += `<line x1="${sx}" y1="${inT}" x2="${sx}" y2="${inB}" stroke="#e67e22" stroke-width="0.8" stroke-dasharray="3,4"/>`;
        }
      }
      // Support label
      svg += `<text x="${(inL + inR) / 2}" y="${inB - 15}" text-anchor="middle" font-size="8" fill="#e67e22">支保工 @${shoringSpacing}mm（破線）</text>`;

      // ---- Face labels (red) ----
      // A: left outer
      svg += `<text x="${oL - 8}" y="${(inT + inB) / 2}" text-anchor="end" font-size="9" fill="#e74c3c" font-weight="bold">A面→</text>`;
      svg += `<text x="${oL - 8}" y="${(inT + inB) / 2 + 11}" text-anchor="end" font-size="7" fill="#e74c3c">外面 C型○</text>`;
      // B: left inner
      svg += `<text x="${inL + 5}" y="${(inT + inB) / 2 - 20}" font-size="8" fill="#e74c3c">←B面</text>`;
      svg += `<text x="${inL + 5}" y="${(inT + inB) / 2 - 10}" font-size="7" fill="#e74c3c">内面 B型●</text>`;
      // C: right outer
      svg += `<text x="${oR + 8}" y="${(inT + inB) / 2}" text-anchor="start" font-size="9" fill="#e74c3c" font-weight="bold">←C面</text>`;
      svg += `<text x="${oR + 8}" y="${(inT + inB) / 2 + 11}" text-anchor="start" font-size="7" fill="#e74c3c">外面 C型○</text>`;
      // D: right inner
      svg += `<text x="${inR - 5}" y="${(inT + inB) / 2 - 20}" text-anchor="end" font-size="8" fill="#e74c3c">D面→</text>`;
      svg += `<text x="${inR - 5}" y="${(inT + inB) / 2 - 10}" text-anchor="end" font-size="7" fill="#e74c3c">内面 B型●</text>`;
      // BL: bottom left side
      svg += `<text x="${oL - 3}" y="${oB + 14}" text-anchor="end" font-size="8" fill="#e74c3c">BL面</text>`;
      // BR: bottom right side
      svg += `<text x="${oR + 3}" y="${oB + 14}" text-anchor="start" font-size="8" fill="#e74c3c">BR面</text>`;
      // T: top slab bottom
      svg += `<text x="${(inL + inR) / 2}" y="${inT + 20}" text-anchor="middle" font-size="8" fill="#e74c3c">T面（頂版下面）</text>`;

      // ---- Construction joint line (blue dashed) ----
      // Bottom slab to wall joint
      svg += `<line x1="${oL - 10}" y1="${inB}" x2="${oR + 10}" y2="${inB}" stroke="#0000FF" stroke-width="2" stroke-dasharray="6,3"/>`;
      svg += `<text x="${oR + 12}" y="${inB + 4}" font-size="7" fill="#0000FF">打継目地</text>`;

      // ---- Dimension Lines ----
      // Overall width (bottom)
      const dimBotY = oB + 28;
      svg += dimLine(oL, dimBotY, oR, dimBotY, `${outerW}mm`);

      // Inner width
      const dimInnerWY = dimBotY + 18;
      svg += dimLine(inL, dimInnerWY, inR, dimInnerWY, `${iW}mm（内空）`);

      // Wall thickness labels
      svg += dimLine(oL, dimBotY + 36, inL, dimBotY + 36, `${tWall}`);
      svg += dimLine(inR, dimBotY + 36, oR, dimBotY + 36, `${tWall}`);

      // Overall height (left side)
      const dimLeftX = oL - 22;
      svg += dimLineV(dimLeftX, oT, dimLeftX, oB, `${outerH}mm`);

      // Inner height
      const dimInnerHX = oL - 55;
      svg += dimLineV(dimInnerHX, inT, dimInnerHX, inB, `${iH}mm`);

      // Top slab thickness
      const dimTopX = oL - 82;
      svg += dimLineV(dimTopX, oT, dimTopX, inT, `${tTop}`);

      // Bottom slab thickness
      svg += dimLineV(dimTopX, inB, dimTopX, oB, `${tBot}`);

      // Outer face height label (right side)
      const outerFaceH = iH + tTop + tBot;
      svg += `<text x="${oR + 8}" y="${(inT + inB) / 2 + 30}" text-anchor="start" font-size="7" fill="#666">外面H=${outerFaceH}</text>`;
      svg += `<text x="${inR - 5}" y="${(inT + inB) / 2 + 5}" text-anchor="end" font-size="7" fill="#666">内面H=${iH}</text>`;

      // ---- Legend ----
      const lgX = svgW - 160, lgY = svgH - 130;
      svg += `<rect x="${lgX}" y="${lgY}" width="150" height="120" fill="#fff" stroke="#ddd" stroke-width="0.5" rx="4"/>`;
      svg += `<text x="${lgX + 5}" y="${lgY + 14}" font-size="9" fill="#333" font-weight="bold">凡例</text>`;
      svg += `<rect x="${lgX + 5}" y="${lgY + 20}" width="12" height="10" fill="#d6eaf8" stroke="#1a5276" stroke-width="0.5"/>`;
      svg += `<text x="${lgX + 22}" y="${lgY + 29}" font-size="8" fill="#333">底版</text>`;
      svg += `<rect x="${lgX + 5}" y="${lgY + 35}" width="12" height="10" fill="#d5f5e3" stroke="#1e8449" stroke-width="0.5"/>`;
      svg += `<text x="${lgX + 22}" y="${lgY + 44}" font-size="8" fill="#333">側壁</text>`;
      svg += `<rect x="${lgX + 5}" y="${lgY + 50}" width="12" height="10" fill="#fdebd0" stroke="#e67e22" stroke-width="0.5"/>`;
      svg += `<text x="${lgX + 22}" y="${lgY + 59}" font-size="8" fill="#333">頂版</text>`;
      svg += `<polygon points="${lgX + 5},${lgY + 65} ${lgX + 17},${lgY + 65} ${lgX + 5},${lgY + 75}" fill="#ccc" stroke="#999" stroke-width="0.5"/>`;
      svg += `<text x="${lgX + 22}" y="${lgY + 74}" font-size="8" fill="#333">ハンチ ${haunch}mm</text>`;
      svg += `<line x1="${lgX + 5}" y1="${lgY + 84}" x2="${lgX + 17}" y2="${lgY + 84}" stroke="#0000FF" stroke-width="1.5" stroke-dasharray="4,2"/>`;
      svg += `<text x="${lgX + 22}" y="${lgY + 87}" font-size="8" fill="#333">打継目地</text>`;
      svg += `<circle cx="${lgX + 11}" cy="${lgY + 97}" r="4" fill="none" stroke="#1a5276" stroke-width="1.2"/>`;
      svg += `<text x="${lgX + 22}" y="${lgY + 100}" font-size="8" fill="#333">C型セパ（外面）</text>`;
      svg += `<circle cx="${lgX + 11}" cy="${lgY + 111}" r="4" fill="#1a5276" stroke="#1a5276" stroke-width="1.2"/>`;
      svg += `<text x="${lgX + 22}" y="${lgY + 114}" font-size="8" fill="#333">B型セパ（内面）</text>`;

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
      const faceId = face.id;

      // Determine component
      let componentLabel = '底版側面';
      let componentColor = '#1a5276';
      if (faceId === 'A' || faceId === 'C') { componentLabel = '側壁外面'; componentColor = '#1e8449'; }
      if (faceId === 'B' || faceId === 'D') { componentLabel = '側壁内面'; componentColor = '#27ae60'; }
      if (faceId === 'T') { componentLabel = '頂版下面'; componentColor = '#e67e22'; }

      const isInner = faceId === 'B' || faceId === 'D';
      const isOuter = faceId === 'A' || faceId === 'C';
      const isTopSlab = faceId === 'T';
      const isBottom = faceId === 'BL' || faceId === 'BR';

      const supportInfo = face.support
        ? `<tr><td>控え</td><td>${esc(face.support.type)} ${esc(face.support.spec || '')}</td></tr>`
        : '';

      const sepSymbol = isInner ? '● B型（仕上げ面）' : (isOuter ? '○ C型（一般）' : '-');

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
                  <tr><td>型枠区分</td><td>${esc(face.type || '-')}</td></tr>
                  ${supportInfo}
                </table>
              </div>
              <div class="info-box">
                <h4>セパレーター仕様</h4>
                ${sep.type ? `<table>
                  <tr><td>種類</td><td style="font-size:14px;font-weight:bold">${isInner ? '●' : '○'} ${esc(sep.type || '-')} ${esc(sep.diameter || '')}</td></tr>
                  <tr><td>水平ピッチ</td><td>@${sep.pitch_h_mm || '-'}mm</td></tr>
                  <tr><td>垂直ピッチ</td><td>@${sep.pitch_v_mm || '-'}mm</td></tr>
                  <tr><td>段数</td><td>${sep.rows || '-'}段</td></tr>
                  ${sep.rows > 1 ? `<tr><td>段位置</td><td style="font-size:10px">${(sep.row_positions_mm || []).join(', ')}mm</td></tr>` : ''}
                  <tr><td>セパ長</td><td>${sep.length_mm || '-'}mm</td></tr>
                  <tr><td>本数</td><td>${sep.count || '-'}本</td></tr>
                  ${sep.note ? `<tr><td>備考</td><td style="color:#e74c3c;font-weight:bold">${esc(sep.note)}</td></tr>` : ''}
                </table>` : `<p style="font-size:12px;color:#999">${isTopSlab ? '底型枠（パイプサポート支保工）' : 'セパレーターなし（控え杭で固定）'}</p>`}
              </div>
              ${isInner ? `<div class="info-box full">
                <h4>内面仕上げ注意</h4>
                <p style="font-size:12px;color:#e74c3c;font-weight:bold">内空面のためB型セパ＋Pコン使用。脱型後Pコン穴はモルタル充填。水路仕上げ面は平滑に仕上げること。</p>
              </div>` : ''}
              ${isTopSlab ? `<div class="info-box full">
                <h4>支保工詳細</h4>
                <p style="font-size:12px;color:#e67e22;font-weight:bold">パイプサポート@${data.structure?.shoring?.top_slab?.spacing_mm || 900}mm、大引${esc(data.structure?.shoring?.top_slab?.girder || '-')}@${data.structure?.shoring?.top_slab?.spacing_mm || 900}mm、根太${esc(data.structure?.shoring?.top_slab?.joist || '-')}</p>
              </div>` : ''}
              ${isBottom ? `<div class="info-box full">
                <h4>底版型枠注意</h4>
                <p style="font-size:12px;color:#1a5276;font-weight:bold">底版側面型枠 — セパなし。控え杭で固定。低い型枠のため横使い。</p>
              </div>` : ''}
            </div>
          </div>
        </div>`;

      this.renderFaceDiagram(faceId, face);
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

      const faceW = face.width_mm || 10000;
      const faceH = face.height_mm || 3000;
      const sep = face.separators || {};
      const isInner = faceId === 'B' || faceId === 'D';
      const isOuter = faceId === 'A' || faceId === 'C';
      const isTopSlab = faceId === 'T';
      const isBottom = faceId === 'BL' || faceId === 'BR';

      // Determine multi-row
      const maxRow = panels.reduce((m, p) => Math.max(m, p.row || 1), 1);

      // Drawing area
      const marginL = 65, marginR = 60, marginT = 25, marginB = 100;
      const drawW = Math.max(500, Math.min(1100, panels.length * 50));
      const drawH = Math.max(150, Math.min(400, faceH * 0.08));
      const svgW = drawW + marginL + marginR;
      const svgH = drawH + marginT + marginB;
      const scaleX = drawW / faceW;
      const scaleY = drawH / faceH;

      let svg = `<svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg" style="font-family:'BIZ UDPGothic','Meiryo',sans-serif">`;

      // Background fill
      svg += `<rect x="${marginL}" y="${marginT}" width="${drawW}" height="${drawH}" fill="#fafafa" stroke="#ccc" stroke-width="0.5"/>`;

      // Draw panels
      if (showPanels) {
        if (maxRow > 1) {
          // Multi-row layout
          const rowGroups = {};
          panels.forEach(p => {
            const r = p.row || 1;
            if (!rowGroups[r]) rowGroups[r] = [];
            rowGroups[r].push(p);
          });

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
              const ppx = marginL + xOff * scaleX;
              const ppy = marginT + yOff;
              const isCut = p.type === 'カット';
              svg += `<rect x="${ppx}" y="${ppy}" width="${pw}" height="${ph}" fill="${isCut ? '#FFF3B0' : '#fff'}" stroke="#888" stroke-width="0.8"/>`;
              if (pw > 25) {
                svg += `<text x="${ppx + pw / 2}" y="${ppy + 14}" text-anchor="middle" font-size="${pw > 40 ? 8 : 6}" fill="#333">${esc(p.id)}</text>`;
                if (pw > 50) {
                  svg += `<text x="${ppx + pw / 2}" y="${ppy + 25}" text-anchor="middle" font-size="7" fill="#888">${p.width_mm}×${p.height_mm}</text>`;
                }
              }
              xOff += p.width_mm;
            });
            yOff += rowDrawH;
          }
        } else {
          // Single row
          let xOff = 0;
          panels.forEach(p => {
            const pw = p.width_mm * scaleX;
            const ph = drawH;
            const ppx = marginL + xOff;
            const ppy = marginT;
            const isCut = p.type === 'カット';
            svg += `<rect x="${ppx}" y="${ppy}" width="${pw}" height="${ph}" fill="${isCut ? '#FFF3B0' : '#fff'}" stroke="#888" stroke-width="0.8"/>`;
            if (pw > 20) {
              svg += `<text x="${ppx + pw / 2}" y="${ppy + 14}" text-anchor="middle" font-size="${pw > 40 ? 9 : 7}" fill="#333">${esc(p.id)}</text>`;
              if (pw > 45) {
                svg += `<text x="${ppx + pw / 2}" y="${ppy + 26}" text-anchor="middle" font-size="7" fill="#888">${p.orientation === '縦' ? '↑縦' : '→横'}</text>`;
              }
            }
            xOff += p.width_mm * scaleX;
          });
        }
      }

      // Separators
      if (showSeparators && sep.type) {
        const pitchH = sep.pitch_h_mm || 450;
        const edgeM = sep.edge_margin_mm || 225;
        const rowPositions = sep.row_positions_mm || [faceH / 2];
        const isBType = sep.type === 'B型';

        for (let x = edgeM; x <= faceW - edgeM + 1; x += pitchH) {
          const sx = marginL + x * scaleX;
          rowPositions.forEach(ry => {
            const sy = marginT + (faceH - ry) * scaleY;
            if (isBType) {
              // B-type: filled circle
              svg += `<circle cx="${sx}" cy="${sy}" r="3.5" fill="#1a5276" stroke="#1a5276" stroke-width="0.8"/>`;
            } else {
              // C-type: open circle
              svg += `<circle cx="${sx}" cy="${sy}" r="3.5" fill="none" stroke="#1a5276" stroke-width="1.2"/>`;
            }
          });
        }
      }

      // Construction joint line for wall faces
      const jointsData = appData?.structure?.joints || {};
      const conJointsData = jointsData.construction_joints || [];
      if ((isOuter || isInner) && showDimensions) {
        svg += `<line x1="${marginL}" y1="${marginT + drawH}" x2="${marginL + drawW}" y2="${marginT + drawH}" stroke="#0000FF" stroke-width="1.5" stroke-dasharray="6,3"/>`;
        const jLabel = conJointsData.length > 0 ? '打継目地（' + esc(conJointsData[0].treatment || '') + '）' : '打継目地';
        svg += `<text x="${marginL + drawW + 5}" y="${marginT + drawH + 3}" font-size="7" fill="#0000FF">${jLabel}</text>`;
        // Waterstop indicator
        if (conJointsData.length > 0 && conJointsData[0].waterstop?.exists) {
          svg += `<line x1="${marginL}" y1="${marginT + drawH - 2}" x2="${marginL + drawW}" y2="${marginT + drawH - 2}" stroke="#0000FF" stroke-width="0.8" stroke-dasharray="2,4"/>`;
          svg += `<text x="${marginL + drawW + 5}" y="${marginT + drawH - 5}" font-size="6" fill="#0066CC">止水板: ${esc(conJointsData[0].waterstop.type || '')}</text>`;
        }
      }

      // Bottom slab note
      if (isBottom && showDimensions) {
        svg += `<text x="${marginL + drawW / 2}" y="${marginT - 5}" text-anchor="middle" font-size="8" fill="#1a5276" font-weight="bold">※ セパなし — 控え杭で固定（低型枠）</text>`;
      }

      // Top slab shoring note
      if (isTopSlab && showDimensions) {
        svg += `<text x="${marginL + drawW / 2}" y="${marginT - 5}" text-anchor="middle" font-size="8" fill="#e67e22" font-weight="bold">※ パイプサポート支保工（セパなし）</text>`;
      }

      // Separator type label
      if (sep.type && showDimensions) {
        const sepLabel = sep.type === 'B型' ? '● B型セパ（仕上げ面）' : '○ C型セパ（一般面）';
        svg += `<text x="${marginL + drawW / 2}" y="${marginT - 5}" text-anchor="middle" font-size="9" fill="#1a5276" font-weight="bold">${sepLabel}</text>`;
      }

      // Dimensions
      if (showDimensions) {
        const dimY1 = marginT + drawH + 16;
        const dimY2 = dimY1 + 22;

        // Total width
        svg += dimLine(marginL, dimY1, marginL + drawW, dimY1, `${faceW.toLocaleString()}mm`);

        // Panel widths (for single row, up to 15 panels)
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
          svg += `<text x="${marginL + drawW / 2}" y="${dimY3}" text-anchor="middle" font-size="9" fill="#1a5276">@${sep.pitch_h_mm}（セパピッチ）</text>`;
        }

        // Height dimension
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
      const dim = s.dimensions || {};

      const iW = dim.inner_width_mm || 3000;
      const iH = dim.inner_height_mm || 3000;
      const tTop = dim.top_slab_thickness_mm || 400;
      const tBot = dim.bottom_slab_thickness_mm || 500;
      const tWall = dim.wall_thickness_mm || 400;
      const haunch = dim.haunch_size_mm || 200;
      const spanLen = dim.span_length_mm || 10000;

      const outerW = iW + 2 * tWall;
      const outerH = iH + tTop + tBot;

      // Camera
      set3DCameraTarget(outerW / 2, outerH / 2, spanLen / 2, Math.max(outerW, outerH, spanLen) * 1.3);

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
      const groundGeo = new THREE.PlaneGeometry(outerW + 4000, spanLen + 4000);
      const groundMat = new THREE.MeshLambertMaterial({ color: 0x8B7355, transparent: true, opacity: 0.25 });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(outerW / 2, -10, spanLen / 2);
      scene.add(ground);

      // ---- Bottom Slab (translucent) ----
      const botGeo = new THREE.BoxGeometry(outerW, tBot, spanLen);
      const botMat = new THREE.MeshLambertMaterial({ color: 0xd6eaf8, transparent: true, opacity: 0.25 });
      const botMesh = new THREE.Mesh(botGeo, botMat);
      botMesh.position.set(outerW / 2, tBot / 2, spanLen / 2);
      scene.add(botMesh);

      // ---- Left Wall (translucent) ----
      const wallGeo = new THREE.BoxGeometry(tWall, iH, spanLen);
      const wallMatL = new THREE.MeshLambertMaterial({ color: 0xd5f5e3, transparent: true, opacity: 0.2 });
      const leftWallMesh = new THREE.Mesh(wallGeo, wallMatL);
      leftWallMesh.position.set(tWall / 2, tBot + iH / 2, spanLen / 2);
      scene.add(leftWallMesh);

      // ---- Right Wall (translucent) ----
      const wallMatR = new THREE.MeshLambertMaterial({ color: 0xd5f5e3, transparent: true, opacity: 0.2 });
      const rightWallMesh = new THREE.Mesh(wallGeo.clone(), wallMatR);
      rightWallMesh.position.set(outerW - tWall / 2, tBot + iH / 2, spanLen / 2);
      scene.add(rightWallMesh);

      // ---- Top Slab (translucent) ----
      const topGeo = new THREE.BoxGeometry(outerW, tTop, spanLen);
      const topMat = new THREE.MeshLambertMaterial({ color: 0xfdebd0, transparent: true, opacity: 0.25 });
      const topMesh = new THREE.Mesh(topGeo, topMat);
      topMesh.position.set(outerW / 2, tBot + iH + tTop / 2, spanLen / 2);
      scene.add(topMesh);

      // ---- Haunch prisms (4 corners, along Z) ----
      const haunchShape = new THREE.Shape();
      haunchShape.moveTo(0, 0);
      haunchShape.lineTo(haunch, 0);
      haunchShape.lineTo(0, haunch);
      haunchShape.lineTo(0, 0);
      const haunchExtrudeSettings = { depth: spanLen, bevelEnabled: false };
      const haunchGeo = new THREE.ExtrudeGeometry(haunchShape, haunchExtrudeSettings);
      const haunchMat = new THREE.MeshLambertMaterial({ color: 0xcccccc, transparent: true, opacity: 0.4 });

      // Bottom-left haunch (inside corner at x=tWall, y=tBot)
      const h1 = new THREE.Mesh(haunchGeo, haunchMat);
      h1.position.set(tWall, tBot, 0);
      scene.add(h1);

      // Bottom-right haunch (mirrored)
      const h2 = new THREE.Mesh(haunchGeo.clone(), haunchMat);
      h2.position.set(outerW - tWall, tBot, 0);
      h2.scale.x = -1;
      scene.add(h2);

      // Top-left haunch
      const h3 = new THREE.Mesh(haunchGeo.clone(), haunchMat);
      h3.position.set(tWall, tBot + iH, 0);
      h3.scale.y = -1;
      scene.add(h3);

      // Top-right haunch
      const h4 = new THREE.Mesh(haunchGeo.clone(), haunchMat);
      h4.position.set(outerW - tWall, tBot + iH, 0);
      h4.scale.x = -1;
      h4.scale.y = -1;
      scene.add(h4);

      // ---- Formwork face meshes ----
      const blFace = ff('BL');
      const brFace = ff('BR');
      const aFace = ff('A');
      const bFace = ff('B');
      const cFace = ff('C');
      const dFace = ff('D');
      const tFace = ff('T');

      const blMesh = createFaceMesh(blFace, spanLen, tBot + 50);
      const brMesh = createFaceMesh(brFace, spanLen, tBot + 50);
      const aMesh = createFaceMesh(aFace, spanLen, outerH);
      const bMesh = createFaceMesh(bFace, spanLen, iH);
      const cMesh = createFaceMesh(cFace, spanLen, outerH);
      const dMesh = createFaceMesh(dFace, spanLen, iH);
      const tMesh = createFaceMesh(tFace, iW, spanLen);

      [blMesh, brMesh, aMesh, bMesh, cMesh, dMesh, tMesh].forEach(m => scene.add(m));

      // ---- Edge lines ----
      const edgeMat = new THREE.LineBasicMaterial({ color: 0x555555 });
      // Outer box bottom
      const ob = [
        [0, 0, 0], [outerW, 0, 0], [outerW, 0, spanLen], [0, 0, spanLen], [0, 0, 0]
      ].map(p => new THREE.Vector3(...p));
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ob), edgeMat));
      // Outer box top
      const ot = ob.map(p => new THREE.Vector3(p.x, outerH, p.z));
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ot), edgeMat));
      // Vertical edges
      [[0, 0], [outerW, 0], [outerW, spanLen], [0, spanLen]].forEach(([x, z]) => {
        scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(x, 0, z), new THREE.Vector3(x, outerH, z)
        ]), edgeMat));
      });

      // ---- Construction joint line (blue) ----
      const jointMat = new THREE.LineBasicMaterial({ color: 0x0000FF });
      const jy = tBot;
      const jPts = [
        new THREE.Vector3(0, jy, 0), new THREE.Vector3(outerW, jy, 0),
        new THREE.Vector3(outerW, jy, spanLen), new THREE.Vector3(0, jy, spanLen),
        new THREE.Vector3(0, jy, 0)
      ];
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(jPts), jointMat));

      // ---- Construction joint plane (blue translucent) ----
      const jointsInfo = data.structure?.joints || {};
      const conJoints3D = jointsInfo.construction_joints || [];
      if (conJoints3D.length > 0) {
        const jointPlaneGeo = new THREE.PlaneGeometry(outerW, spanLen);
        const jointPlaneMat = new THREE.MeshLambertMaterial({ color: 0x0000FF, transparent: true, opacity: 0.08, side: THREE.DoubleSide });
        const jointPlane = new THREE.Mesh(jointPlaneGeo, jointPlaneMat);
        jointPlane.rotation.x = -Math.PI / 2;
        jointPlane.position.set(outerW / 2, jy, spanLen / 2);
        scene.add(jointPlane);
      }

      // ---- Assembled positions (folded) and flat layout (unfolded) ----
      const faces3D = [
        // BL: bottom slab left side (X=0 face, along Z)
        {
          mesh: blMesh,
          folded: { pos: [0, tBot / 2, spanLen / 2], rot: [0, -Math.PI / 2, 0] },
          unfolded: { pos: [-spanLen / 2 - 500, 0, spanLen / 2], rot: [-Math.PI / 2, 0, 0] }
        },
        // BR: bottom slab right side (X=outerW face)
        {
          mesh: brMesh,
          folded: { pos: [outerW, tBot / 2, spanLen / 2], rot: [0, Math.PI / 2, 0] },
          unfolded: { pos: [outerW + spanLen / 2 + 500, 0, spanLen / 2], rot: [-Math.PI / 2, 0, 0] }
        },
        // A: left wall outer (X=0 face full height)
        {
          mesh: aMesh,
          folded: { pos: [0, outerH / 2, spanLen / 2], rot: [0, -Math.PI / 2, 0] },
          unfolded: { pos: [-spanLen / 2 - 1500, 0, spanLen / 2], rot: [-Math.PI / 2, 0, 0] }
        },
        // B: left wall inner (X=tWall)
        {
          mesh: bMesh,
          folded: { pos: [tWall, tBot + iH / 2, spanLen / 2], rot: [0, Math.PI / 2, 0] },
          unfolded: { pos: [spanLen / 2 + 500, 0, -iH / 2 - 500], rot: [-Math.PI / 2, 0, 0] }
        },
        // C: right wall outer (X=outerW)
        {
          mesh: cMesh,
          folded: { pos: [outerW, outerH / 2, spanLen / 2], rot: [0, Math.PI / 2, 0] },
          unfolded: { pos: [outerW + spanLen / 2 + 1500, 0, spanLen / 2], rot: [-Math.PI / 2, 0, 0] }
        },
        // D: right wall inner (X=outerW-tWall)
        {
          mesh: dMesh,
          folded: { pos: [outerW - tWall, tBot + iH / 2, spanLen / 2], rot: [0, -Math.PI / 2, 0] },
          unfolded: { pos: [spanLen / 2 + 500, 0, spanLen + iH / 2 + 500], rot: [-Math.PI / 2, 0, 0] }
        },
        // T: top slab bottom face (horizontal, Y=tBot+iH)
        {
          mesh: tMesh,
          folded: { pos: [outerW / 2, tBot + iH, spanLen / 2], rot: [-Math.PI / 2, 0, 0] },
          unfolded: { pos: [outerW / 2, 0, spanLen + iW / 2 + 1500], rot: [-Math.PI / 2, 0, 0] }
        }
      ];

      // Set initial folded state
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

      // Page 1: Overview
      pdfDrawHeaderFooter(doc, 'BOXカルバート 全体確認図', 1, 3);
      const s = data.structure;
      const dim = s.dimensions || {};
      let y = m + 35;
      doc.setFontSize(9);
      doc.setTextColor(0);
      doc.text(`構造物: ${s.name || '-'}（${s.subtype || '-'}）`, m + 10, y); y += 7;
      doc.text(`内空: ${dim.inner_width_mm || '-'}×${dim.inner_height_mm || '-'}mm`, m + 10, y); y += 7;
      doc.text(`頂版厚: ${dim.top_slab_thickness_mm || '-'}mm / 底版厚: ${dim.bottom_slab_thickness_mm || '-'}mm / 側壁厚: ${dim.wall_thickness_mm || '-'}mm`, m + 10, y); y += 7;
      doc.text(`ハンチ: ${dim.haunch_size_mm || '-'}mm / スパン長: ${dim.span_length_mm || '-'}mm`, m + 10, y); y += 7;
      doc.text(`打設方法: ${s.casting_method || '-'}`, m + 10, y); y += 10;

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
            const sepLabel = sep.type ? `${sep.type}${sep.count || 0}本` : 'なし';
            doc.text(`  ${face.id}面: ${face.name} — ${face.width_mm ? (face.width_mm / 1000).toFixed(1) + 'm' : '-'} × ${face.height_mm || '-'}mm — パネル${face.panels?.length || 0}枚 — セパ:${sepLabel}`, m + 10, y);
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
      y += 10;

      // Shoring summary
      if (q.shoring) {
        doc.text('支保工', m + 10, y); y += 6;
        doc.setFontSize(8);
        doc.text(`パイプサポート: ${q.shoring.pipe_supports?.count || '-'}本 ${q.shoring.pipe_supports?.spacing || ''}`, m + 15, y); y += 5;
        doc.text(`大引: ${q.shoring.girders?.size || '-'} ${q.shoring.girders?.spacing || ''} 総延長${q.shoring.girders?.total_length_m || '-'}m`, m + 15, y); y += 5;
        doc.text(`根太: ${q.shoring.joists?.size || '-'} ${q.shoring.joists?.spacing || ''} 総延長${q.shoring.joists?.total_length_m || '-'}m`, m + 15, y);
      }

      const filename = `${data.project?.name || 'box_culvert'}_型枠割付_${data.project?.created_at || 'draft'}.pdf`;
      doc.save(filename);
    }
  };

  registerModule('box_culvert', BoxCulvertModule);
})();
