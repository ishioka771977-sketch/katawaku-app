// ============================================================
// 型知 KATACHI — 橋脚モジュール (pier.js)
// ============================================================

(function() {
  const PierModule = {
    type: 'pier',
    label: '橋脚',

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
    // Lateral pressure calculation helper
    // ============================================================
    _calcLateralPressure(liftHeightMm) {
      const H = liftHeightMm / 1000; // m
      const Wc = 24; // kN/m³
      const P = Math.min(Wc * H, 100); // cap at 100 kN/m²
      const recDia = H >= 1.5 ? 'W3/8（3分）' : 'W5/16（2分5厘）';
      const recPitch = 450;
      const allowable = H >= 1.5 ? 20 : 14; // kN
      const tributaryArea = allowable / P;
      const maxPitch = Math.floor(Math.sqrt(tributaryArea * 1e6)); // mm
      return { P: P.toFixed(1), H, recDia, recPitch, allowable, maxPitch, isHeavy: H >= 1.5 };
    },

    // ============================================================
    // Overview
    // ============================================================
    buildOverview(data) {
      const s = data.structure;
      const footing = s.footing || {};
      const body = s.body || {};
      const capBeam = s.cap_beam || {};
      const joints = s.joints || {};
      const conJoints = joints.construction_joints || s.construction_joints || [];
      const expJoints = joints.expansion_joints || [];

      // Shape label
      const shapeLabel = body.shape === 'circular' ? '柱型（円形鋼製パネル）' : '壁型（合板大型パネル）';
      const formworkLabel = body.formwork_type === 'plywood_large_panel' ? '合板大型パネル' :
                            body.formwork_type === 'steel_panel' ? '鋼製パネル' : (body.formwork_type || '-');
      const shoringLabel = capBeam.shoring_type === 'bracket' ? 'ブラケット支保工' : (capBeam.shoring_type || '-');

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
        jointRows += `<tr><td>${esc(j.name || j.position || '')}</td><td>${esc(j.type || '')}</td><td>${esc(j.treatment || '')}</td></tr>`;
      });

      // Lateral pressure calculation for each lift
      const liftCount = body.lift_count || 1;
      const liftH = body.lift_height_mm || 3000;
      let pressureRows = '';
      for (let i = 1; i <= liftCount; i++) {
        const lp = this._calcLateralPressure(liftH);
        const color = lp.isHeavy ? '#e67e22' : '#27ae60';
        pressureRows += `<tr>
          <td>${i}リフト目</td>
          <td>${liftH}mm（${lp.H.toFixed(1)}m）</td>
          <td style="font-weight:bold;color:${color}">${lp.P} kN/m²</td>
          <td style="color:${color}">${lp.recDia}</td>
          <td>@${lp.recPitch}mm</td>
          <td>最大 ${lp.maxPitch}mm</td>
        </tr>`;
      }

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
                  <tr><td>型枠固定</td><td>H鋼控え杭（セパなし）</td></tr>
                </table>
              </div>
              <div class="info-box">
                <h4>躯体</h4>
                <table>
                  <tr><td>形状</td><td>${shapeLabel}</td></tr>
                  <tr><td>幅</td><td>${body.width_mm || '-'}mm</td></tr>
                  <tr><td>厚さ</td><td>${body.thickness_mm || '-'}mm</td></tr>
                  <tr><td>高さ</td><td>${body.height_mm || '-'}mm</td></tr>
                  <tr><td>リフト高</td><td>${body.lift_height_mm || '-'}mm</td></tr>
                  <tr><td>リフト数</td><td>${body.lift_count || '-'}リフト</td></tr>
                  <tr><td>型枠仕様</td><td>${formworkLabel}</td></tr>
                </table>
              </div>
              <div class="info-box">
                <h4>梁部（コーベル）</h4>
                <table>
                  <tr><td>幅</td><td>${capBeam.width_mm || '-'}mm</td></tr>
                  <tr><td>奥行</td><td>${capBeam.depth_mm || '-'}mm</td></tr>
                  <tr><td>高さ</td><td>${capBeam.height_mm || '-'}mm</td></tr>
                  <tr><td>張出し</td><td>${capBeam.cantilever_mm || '-'}mm</td></tr>
                  <tr><td>支保工</td><td>${shoringLabel}</td></tr>
                </table>
              </div>
              <div class="info-box">
                <h4>打設フェーズ（${data.phases ? data.phases.length : 0}回）</h4>
                <table>
                  <thead><tr><th></th><th>フェーズ名</th><th>面数</th></tr></thead>
                  <tbody>${phaseRows}</tbody>
                </table>
              </div>
              <div class="info-box full" style="border:2px solid #e67e22;background:#fef9e7">
                <h4 style="color:#e67e22;border-bottom-color:#e67e22">側圧計算結果（P = Wc × H, Wc=24kN/m³）</h4>
                <table class="qty-table">
                  <thead><tr><th>リフト</th><th>打設高さ</th><th>側圧 P</th><th>推奨セパ径</th><th>推奨ピッチ</th><th>最大ピッチ</th></tr></thead>
                  <tbody>${pressureRows}</tbody>
                </table>
                <p style="font-size:11px;color:#888;margin-top:6px">※ W5/16(φ8mm)許容14kN / W3/8(φ9.5mm)許容20kN。リフト高1.5m以上はW3/8推奨。側圧上限100kN/m²</p>
              </div>
              ${conJoints.length > 0 ? `<div class="info-box">
                <h4>目地</h4>
                <table>
                  <tr><td>伸縮目地</td><td>${expJoints.length > 0 ? expJoints.length + '箇所' : 'なし'}</td></tr>
                  <tr><td>打継目地</td><td>${conJoints.length}箇所</td></tr>
                  ${conJoints.map(j => '<tr><td>\u3000' + esc(j.position || j.name || '') + '</td><td>' + esc(j.treatment||'') + '</td></tr>').join('')}
                  ${joints.note ? '<tr><td>備考</td><td>' + esc(joints.note) + '</td></tr>' : ''}
                </table>
              </div>` : ''}
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
                <div class="card"><div class="card-header">側面図（立面図）</div><div class="card-body"><div class="diagram-container" id="crossSectionDiagram"></div></div></div>
              </div>
              ${noteHtml ? `<div class="full"><div class="info-box"><h4>注意事項</h4>${noteHtml}</div></div>` : ''}
            </div>
          </div>
        </div>`;

      this.renderCrossSection(data);
    },

    // ============================================================
    // Cross Section Diagram (側面図 / 立面図)
    // ============================================================
    renderCrossSection(data) {
      const s = data.structure;
      const footing = s.footing || {};
      const body = s.body || {};
      const capBeam = s.cap_beam || {};

      const svgW = 660, svgH = 520;
      const marginL = 100, marginB = 50;

      // Total dimensions
      const fW = footing.width_mm || 10000;
      const fD = footing.depth_mm || 6000;
      const fH = footing.thickness_mm || 2500;
      const bW = body.width_mm || 6000;
      const bT = body.thickness_mm || 2000;
      const bH = body.height_mm || 15000;
      const liftH = body.lift_height_mm || 3000;
      const liftCount = body.lift_count || 5;
      const cbW = capBeam.width_mm || 10000;
      const cbD = capBeam.depth_mm || 2000;
      const cbH = capBeam.height_mm || 2000;
      const cantilever = capBeam.cantilever_mm || 2000;

      const totalH = fH + bH + cbH;
      const maxW = Math.max(fW, cbW);

      // Scale to fit
      const scH = (svgH - marginB - 50) / totalH;
      const scW = (svgW - marginL - 80) / maxW;
      const sc = Math.min(scH, scW, 0.025);

      const baseY = svgH - marginB;

      // Footing dimensions (scaled)
      const sfW = fW * sc;
      const sfH = fH * sc;
      const sfD = fD * sc; // shown as depth label only

      // Body dimensions (scaled)
      const sbW = bW * sc;
      const sbH = bH * sc;

      // Cap beam dimensions (scaled)
      const scbW = cbW * sc;
      const scbH = cbH * sc;

      // Positioning: center everything on X
      const centerX = marginL + maxW * sc / 2;
      const footLeft = centerX - sfW / 2;
      const footRight = centerX + sfW / 2;
      const footTop = baseY - sfH;

      const bodyLeft = centerX - sbW / 2;
      const bodyRight = centerX + sbW / 2;
      const bodyTop = footTop - sbH;

      const cbLeft = centerX - scbW / 2;
      const cbRight = centerX + scbW / 2;
      const cbTop = bodyTop - scbH;

      let svg = `<svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg" style="font-family:'BIZ UDPGothic','Meiryo',sans-serif">`;

      // Ground line
      svg += `<line x1="0" y1="${baseY}" x2="${svgW}" y2="${baseY}" stroke="#8B4513" stroke-width="2" stroke-dasharray="8,4"/>`;
      svg += `<text x="10" y="${baseY + 14}" font-size="9" fill="#8B4513">G.L.</text>`;

      // ---- Footing (blue-tint) ----
      svg += `<rect x="${footLeft}" y="${footTop}" width="${sfW}" height="${sfH}" fill="#d6eaf8" stroke="#1a5276" stroke-width="1.5"/>`;
      svg += `<text x="${centerX}" y="${footTop + sfH / 2 + 4}" text-anchor="middle" font-size="10" fill="#1a5276" font-weight="bold">フーチング</text>`;

      // Face labels on footing
      svg += `<text x="${footLeft - 3}" y="${footTop + sfH / 2}" text-anchor="end" font-size="8" fill="#e74c3c">F-C←</text>`;
      svg += `<text x="${footRight + 3}" y="${footTop + sfH / 2}" text-anchor="start" font-size="8" fill="#e74c3c">→F-D</text>`;
      svg += `<text x="${centerX}" y="${baseY - 3}" text-anchor="middle" font-size="7" fill="#e74c3c">F-A(前面) / F-B(背面) : 紙面直交方向</text>`;

      // ---- Body / Stem (green-tint) ----
      if (body.shape === 'circular') {
        // Ellipse for circular column
        svg += `<ellipse cx="${centerX}" cy="${footTop - sbH / 2}" rx="${sbW / 2}" ry="${sbH / 2}" fill="#d5f5e3" stroke="#1e8449" stroke-width="1.5"/>`;
      } else {
        svg += `<rect x="${bodyLeft}" y="${bodyTop}" width="${sbW}" height="${sbH}" fill="#d5f5e3" stroke="#1e8449" stroke-width="1.5"/>`;
      }
      svg += `<text x="${centerX}" y="${footTop - sbH / 2 + 4}" text-anchor="middle" font-size="10" fill="#1e8449" font-weight="bold">躯体</text>`;
      svg += `<text x="${centerX}" y="${footTop - sbH / 2 + 16}" text-anchor="middle" font-size="8" fill="#1e8449">${body.shape === 'circular' ? '柱型' : '壁型'}</text>`;

      // Lift division lines (dashed blue)
      for (let i = 1; i <= liftCount; i++) {
        const ly = footTop - liftH * i * sc;
        if (i < liftCount) {
          svg += `<line x1="${bodyLeft}" y1="${ly}" x2="${bodyRight}" y2="${ly}" stroke="#0000FF" stroke-width="1.5" stroke-dasharray="6,3"/>`;
          svg += `<text x="${bodyRight + 5}" y="${ly + 3}" font-size="7" fill="#0000FF">打継(${i}L/${i + 1}L)</text>`;
        }
        // Lift number label (centered in lift zone)
        const lyTop = footTop - liftH * i * sc;
        const lyBot = footTop - liftH * (i - 1) * sc;
        svg += `<text x="${bodyLeft - 5}" y="${(lyTop + lyBot) / 2 + 3}" text-anchor="end" font-size="7" fill="#1e8449">${i}L</text>`;
      }

      // Face labels on body
      svg += `<text x="${bodyLeft - 18}" y="${footTop - sbH / 2}" text-anchor="end" font-size="8" fill="#e74c3c">B-A→</text>`;
      svg += `<text x="${bodyRight + 18}" y="${footTop - sbH / 2}" text-anchor="start" font-size="8" fill="#e74c3c">←B-B</text>`;

      // ---- Cap Beam (orange-tint) ----
      svg += `<rect x="${cbLeft}" y="${cbTop}" width="${scbW}" height="${scbH}" fill="#fdebd0" stroke="#e67e22" stroke-width="1.5"/>`;
      svg += `<text x="${centerX}" y="${cbTop + scbH / 2 + 4}" text-anchor="middle" font-size="10" fill="#e67e22" font-weight="bold">梁部（コーベル）</text>`;

      // Cantilever indicators
      const cantSc = cantilever * sc;
      svg += `<line x1="${cbLeft}" y1="${cbTop + scbH}" x2="${bodyLeft}" y2="${cbTop + scbH}" stroke="#e67e22" stroke-width="1" stroke-dasharray="3,2"/>`;
      svg += `<line x1="${bodyRight}" y1="${cbTop + scbH}" x2="${cbRight}" y2="${cbTop + scbH}" stroke="#e67e22" stroke-width="1" stroke-dasharray="3,2"/>`;
      svg += `<text x="${(cbLeft + bodyLeft) / 2}" y="${cbTop + scbH - 3}" text-anchor="middle" font-size="7" fill="#e67e22">張出${cantilever}</text>`;
      svg += `<text x="${(bodyRight + cbRight) / 2}" y="${cbTop + scbH - 3}" text-anchor="middle" font-size="7" fill="#e67e22">張出${cantilever}</text>`;

      // Face labels on cap beam
      svg += `<text x="${cbLeft - 3}" y="${cbTop + scbH / 2}" text-anchor="end" font-size="8" fill="#e74c3c">CB-A→</text>`;
      svg += `<text x="${cbRight + 3}" y="${cbTop + scbH / 2}" text-anchor="start" font-size="8" fill="#e74c3c">←CB-B</text>`;
      svg += `<text x="${centerX}" y="${cbTop - 5}" text-anchor="middle" font-size="7" fill="#e74c3c">CB-底（底面型枠）</text>`;

      // ---- Construction Joint Lines (blue) ----
      // Footing to body
      svg += `<line x1="${bodyLeft - 8}" y1="${footTop}" x2="${bodyRight + 8}" y2="${footTop}" stroke="#0000FF" stroke-width="2" stroke-dasharray="6,3"/>`;
      // Body to cap beam
      svg += `<line x1="${bodyLeft - 8}" y1="${bodyTop}" x2="${bodyRight + 8}" y2="${bodyTop}" stroke="#0000FF" stroke-width="2" stroke-dasharray="6,3"/>`;

      // ---- Dimension Lines ----

      // Footing width (horizontal)
      const dimFootY = baseY + 18;
      svg += this._dimLine(footLeft, dimFootY, footRight, dimFootY, `${fW}mm`);

      // Body width
      const dimBodyY = baseY + 34;
      svg += this._dimLine(bodyLeft, dimBodyY, bodyRight, dimBodyY, `${bW}mm`);

      // Cap beam width
      const dimCbY = baseY + 50;
      svg += this._dimLine(cbLeft, dimCbY, cbRight, dimCbY, `${cbW}mm`);

      // Footing thickness (vertical)
      const dimVx1 = footLeft - 20;
      svg += this._dimLineV(dimVx1, footTop, dimVx1, baseY, `${fH}`);

      // Body height (vertical)
      const dimVx2 = footLeft - 50;
      svg += this._dimLineV(dimVx2, bodyTop, dimVx2, footTop, `${bH}`);

      // Cap beam height (vertical)
      const dimVx3 = footLeft - 20;
      svg += this._dimLineV(dimVx3, cbTop, dimVx3, bodyTop, `${cbH}`);

      // Total height
      const dimVx4 = footLeft - 80;
      svg += this._dimLineV(dimVx4, cbTop, dimVx4, baseY, `${totalH}mm`);

      // Lift height label
      if (liftCount > 0) {
        const l1top = footTop - liftH * sc;
        svg += `<text x="${bodyRight + 50}" y="${(footTop + l1top) / 2 + 3}" font-size="8" fill="#1e8449">1リフト = ${liftH}mm</text>`;
      }

      // Body thickness label
      svg += `<text x="${centerX}" y="${footTop - 5}" text-anchor="middle" font-size="7" fill="#666">t=${bT}mm</text>`;

      // Color legend
      svg += `<rect x="${svgW - 155}" y="10" width="145" height="90" fill="#fff" stroke="#ddd" stroke-width="0.5" rx="4"/>`;
      svg += `<text x="${svgW - 150}" y="24" font-size="9" fill="#333" font-weight="bold">凡例</text>`;
      svg += `<rect x="${svgW - 150}" y="30" width="12" height="10" fill="#d6eaf8" stroke="#1a5276" stroke-width="0.5"/>`;
      svg += `<text x="${svgW - 133}" y="39" font-size="8" fill="#333">フーチング</text>`;
      svg += `<rect x="${svgW - 150}" y="45" width="12" height="10" fill="#d5f5e3" stroke="#1e8449" stroke-width="0.5"/>`;
      svg += `<text x="${svgW - 133}" y="54" font-size="8" fill="#333">躯体（壁型/柱型）</text>`;
      svg += `<rect x="${svgW - 150}" y="60" width="12" height="10" fill="#fdebd0" stroke="#e67e22" stroke-width="0.5"/>`;
      svg += `<text x="${svgW - 133}" y="69" font-size="8" fill="#333">梁部（コーベル）</text>`;
      svg += `<line x1="${svgW - 150}" y1="${85}" x2="${svgW - 138}" y2="${85}" stroke="#0000FF" stroke-width="1.5" stroke-dasharray="4,2"/>`;
      svg += `<text x="${svgW - 133}" y="88" font-size="8" fill="#333">打継目地 / リフト境界</text>`;

      svg += `</svg>`;

      const el = document.getElementById('crossSectionDiagram');
      if (el) el.innerHTML = svg;
    },

    // Dimension line helpers
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
      const isBody = face.id.startsWith('B');
      const isCapBeam = face.id.startsWith('CB');

      let componentLabel = 'フーチング';
      let componentColor = '#1a5276';
      if (isBody) { componentLabel = '躯体'; componentColor = '#1e8449'; }
      if (isCapBeam) { componentLabel = '梁部'; componentColor = '#e67e22'; }

      const supportInfo = face.support
        ? `<tr><td>控え</td><td>${esc(face.support.type)} ${esc(face.support.spec || '')}</td></tr>`
        : '';

      // Lateral pressure info for body faces
      let pressureBox = '';
      if (isBody && data.structure?.body?.lift_height_mm) {
        const lp = this._calcLateralPressure(data.structure.body.lift_height_mm);
        const color = lp.isHeavy ? '#e67e22' : '#27ae60';
        pressureBox = `<div class="info-box full" style="border-left:4px solid ${color}">
          <h4 style="color:${color}">側圧計算（このリフト）</h4>
          <table>
            <tr><td>側圧 P = 24 × ${lp.H.toFixed(1)}m</td><td style="font-weight:bold;color:${color}">${lp.P} kN/m²</td></tr>
            <tr><td>推奨セパ径</td><td style="color:${color}">${lp.recDia}</td></tr>
            <tr><td>推奨ピッチ</td><td>@${lp.recPitch}mm</td></tr>
            <tr><td>最大ピッチ</td><td>${lp.maxPitch}mm</td></tr>
          </table>
        </div>`;
      }

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
                  <tr><td>タイプ</td><td>${esc(face.type || '-')}</td></tr>
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
              ${pressureBox}
              ${isCapBeam ? `<div class="info-box full">
                <h4>梁部支保工</h4>
                <p style="font-size:12px;color:#e67e22;font-weight:bold">ブラケット支保工。張出し${data.structure?.cap_beam?.cantilever_mm || '-'}mm。底面・側面型枠。</p>
              </div>` : ''}
              ${isFooting ? `<div class="info-box full">
                <h4>フーチング固定方式</h4>
                <p style="font-size:12px;color:#1a5276;font-weight:bold">セパなし — H鋼控え杭で固定</p>
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
      const faceH = face.height_mm || 3000;
      const sep = face.separators || {};
      const isFooting = faceId.startsWith('F');
      const isBody = faceId.startsWith('B');
      const isCapBeam = faceId.startsWith('CB');

      // Determine if multi-row
      const maxRow = panels.reduce((m, p) => Math.max(m, p.row || 1), 1);

      // Drawing area
      const marginL = 65, marginR = 60, marginT = 30, marginB = 90;
      const drawW = Math.max(500, Math.min(1100, panels.length * 70));
      const drawH = Math.max(150, Math.min(350, faceH * 0.08));
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
          // Multi-row layout (footing faces)
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
          // Single row layout
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

      // Joint lines (construction joints - blue dashed horizontal)
      if (isBody && showDimensions) {
        const jointsData = appData?.structure?.joints || {};
        const cjList = jointsData.construction_joints || appData?.structure?.construction_joints || [];
        let jointDrawn = false;
        if (cjList.length > 0) {
          cjList.forEach(j => {
            if (j.direction === 'horizontal' || j.type === '水平') {
              // Only draw joints that fall within this face's height range
              // Bottom of face is at marginT+drawH, top is at marginT
              // Show a single indicator at bottom for the lift boundary
              if (!jointDrawn) {
                svg += `<line x1="${marginL}" y1="${marginT + drawH}" x2="${marginL + drawW}" y2="${marginT + drawH}" stroke="#0000FF" stroke-width="1.5" stroke-dasharray="6,3"/>`;
                svg += `<text x="${marginL + drawW + 5}" y="${marginT + drawH + 3}" font-size="7" fill="#0000FF">打継目地</text>`;
                jointDrawn = true;
              }
            }
          });
        }
        if (!jointDrawn) {
          svg += `<line x1="${marginL}" y1="${marginT + drawH}" x2="${marginL + drawW}" y2="${marginT + drawH}" stroke="#0000FF" stroke-width="1.5" stroke-dasharray="6,3"/>`;
          svg += `<text x="${marginL + drawW + 5}" y="${marginT + drawH + 3}" font-size="7" fill="#0000FF">打継目地</text>`;
        }
      }

      // Footing support note
      if (isFooting && showDimensions) {
        svg += `<text x="${marginL + drawW / 2}" y="${marginT - 5}" text-anchor="middle" font-size="8" fill="#1a5276" font-weight="bold">※ セパなし — H鋼控え杭で固定</text>`;
      }

      // Cap beam note
      if (isCapBeam && showDimensions) {
        const fType = face.type || '';
        if (fType === '底型枠') {
          svg += `<text x="${marginL + drawW / 2}" y="${marginT - 5}" text-anchor="middle" font-size="8" fill="#e67e22" font-weight="bold">底型枠 — ブラケット支保工上に設置</text>`;
        }
      }

      // Lateral pressure annotation for body faces
      if (isBody && showDimensions) {
        const liftHmm = appData?.structure?.body?.lift_height_mm || 3000;
        const lp = this._calcLateralPressure(liftHmm);
        const color = lp.isHeavy ? '#e67e22' : '#27ae60';
        svg += `<rect x="${marginL + drawW - 160}" y="${marginT + 3}" width="155" height="38" fill="#fff" fill-opacity="0.9" stroke="${color}" stroke-width="1" rx="3"/>`;
        svg += `<text x="${marginL + drawW - 155}" y="${marginT + 16}" font-size="8" fill="${color}" font-weight="bold">側圧 P = 24×${lp.H.toFixed(1)} = ${lp.P} kN/m²</text>`;
        svg += `<text x="${marginL + drawW - 155}" y="${marginT + 28}" font-size="7" fill="${color}">推奨: ${lp.recDia} @${lp.recPitch}mm</text>`;
        svg += `<text x="${marginL + drawW - 155}" y="${marginT + 38}" font-size="7" fill="${color}">最大ピッチ: ${lp.maxPitch}mm</text>`;
      }

      // Dimensions
      if (showDimensions) {
        const dimY1 = marginT + drawH + 16;
        const dimY2 = dimY1 + 22;

        // Total width
        svg += dimLine(marginL, dimY1, marginL + drawW, dimY1, `${faceW.toLocaleString()}mm`);

        // Panel widths (single row only)
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
      const body = s.body || {};
      const capBeam = s.cap_beam || {};

      // Dimensions
      const fW = footing.width_mm || 10000;    // X direction (橋軸直角方向)
      const fD = footing.depth_mm || 6000;       // Z direction (橋軸方向)
      const fH = footing.thickness_mm || 2500;   // Y direction
      const bW = body.width_mm || 6000;
      const bT = body.thickness_mm || 2000;
      const bH = body.height_mm || 15000;
      const liftH = body.lift_height_mm || 3000;
      const liftCount = body.lift_count || 5;
      const cbW = capBeam.width_mm || 10000;
      const cbD = capBeam.depth_mm || 2000;
      const cbH = capBeam.height_mm || 2000;

      // Camera
      const totalH = fH + bH + cbH;
      set3DCameraTarget(fW / 2, totalH / 2, fD / 2, Math.max(fW, fD, totalH) * 1.0);

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
      const groundGeo = new THREE.PlaneGeometry(fW + 6000, fD + 6000);
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
      const faMesh = createFaceMesh(ff('F-A'), fW, fH);
      const fbMesh = createFaceMesh(ff('F-B'), fW, fH);
      const fcMesh = createFaceMesh(ff('F-C'), fD, fH);
      const fdMesh = createFaceMesh(ff('F-D'), fD, fH);
      [faMesh, fbMesh, fcMesh, fdMesh].forEach(m => scene.add(m));

      // ---- Body concrete (translucent) ----
      const bodyBaseY = fH;
      const bodyGeo = new THREE.BoxGeometry(bW, bH, bT);
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0xd5f5e3, transparent: true, opacity: 0.2 });
      const bodyMeshObj = new THREE.Mesh(bodyGeo, bodyMat);
      // Body centered on footing
      const bodyZCenter = fD / 2;
      bodyMeshObj.position.set(fW / 2, bodyBaseY + bH / 2, bodyZCenter);
      scene.add(bodyMeshObj);

      // ---- Body formwork faces (per lift) ----
      const bodyFaceMeshes = [];
      const faces3D = [];

      // Footing faces first
      faces3D.push(
        { mesh: faMesh, folded: { pos: [fW / 2, fH / 2, 0], rot: [0, Math.PI, 0] }, unfolded: { pos: [fW / 2, 0, -fH / 2 - 200], rot: [-Math.PI / 2, 0, 0] } },
        { mesh: fbMesh, folded: { pos: [fW / 2, fH / 2, fD], rot: [0, 0, 0] }, unfolded: { pos: [fW / 2, 0, fD + fH / 2 + 200], rot: [-Math.PI / 2, 0, 0] } },
        { mesh: fcMesh, folded: { pos: [0, fH / 2, fD / 2], rot: [0, -Math.PI / 2, 0] }, unfolded: { pos: [-fD / 2 - 200, 0, fD / 2], rot: [-Math.PI / 2, 0, 0] } },
        { mesh: fdMesh, folded: { pos: [fW, fH / 2, fD / 2], rot: [0, Math.PI / 2, 0] }, unfolded: { pos: [fW + fD / 2 + 200, 0, fD / 2], rot: [-Math.PI / 2, 0, 0] } }
      );

      // Body front/back per lift
      const bodyZ0 = bodyZCenter - bT / 2;
      const bodyZ1 = bodyZCenter + bT / 2;
      for (let i = 1; i <= liftCount; i++) {
        const idA = `B-A${i}`;
        const idB = `B-B${i}`;
        const meshA = createFaceMesh(ff(idA), bW, liftH);
        const meshB = createFaceMesh(ff(idB), bW, liftH);
        scene.add(meshA);
        scene.add(meshB);

        const liftBaseY = bodyBaseY + liftH * (i - 1);
        const liftCenterY = liftBaseY + liftH / 2;
        const unfoldOffset = fH + liftH * (i - 1) + liftH / 2 + 200 * i;

        faces3D.push(
          { mesh: meshA, folded: { pos: [fW / 2, liftCenterY, bodyZ0], rot: [0, Math.PI, 0] }, unfolded: { pos: [fW / 2, 0, -unfoldOffset], rot: [-Math.PI / 2, 0, 0] } },
          { mesh: meshB, folded: { pos: [fW / 2, liftCenterY, bodyZ1], rot: [0, 0, 0] }, unfolded: { pos: [fW / 2, 0, fD + unfoldOffset], rot: [-Math.PI / 2, 0, 0] } }
        );
      }

      // ---- Cap Beam concrete (translucent) ----
      const cbBaseY = bodyBaseY + bH;
      const cbGeo = new THREE.BoxGeometry(cbW, cbH, cbD);
      const cbMat = new THREE.MeshLambertMaterial({ color: 0xfdebd0, transparent: true, opacity: 0.25 });
      const cbMeshObj = new THREE.Mesh(cbGeo, cbMat);
      cbMeshObj.position.set(fW / 2, cbBaseY + cbH / 2, fD / 2);
      scene.add(cbMeshObj);

      // ---- Cap Beam formwork faces ----
      const cbBottomMesh = createFaceMesh(ff('CB-底'), cbW, cbD);
      const cbFrontMesh = createFaceMesh(ff('CB-A'), cbW, cbH);
      const cbBackMesh = createFaceMesh(ff('CB-B'), cbW, cbH);
      [cbBottomMesh, cbFrontMesh, cbBackMesh].forEach(m => scene.add(m));

      const cbZ0 = fD / 2 - cbD / 2;
      const cbZ1 = fD / 2 + cbD / 2;
      const cbUnfoldBase = fH + bH + cbH + 400;

      faces3D.push(
        // Cap beam bottom
        { mesh: cbBottomMesh, folded: { pos: [fW / 2, cbBaseY, fD / 2], rot: [-Math.PI / 2, 0, 0] }, unfolded: { pos: [fW / 2, 0, -cbUnfoldBase - cbD / 2], rot: [-Math.PI / 2, 0, 0] } },
        // Cap beam front
        { mesh: cbFrontMesh, folded: { pos: [fW / 2, cbBaseY + cbH / 2, cbZ0], rot: [0, Math.PI, 0] }, unfolded: { pos: [fW / 2, 0, -cbUnfoldBase - cbD - cbH / 2 - 200], rot: [-Math.PI / 2, 0, 0] } },
        // Cap beam back
        { mesh: cbBackMesh, folded: { pos: [fW / 2, cbBaseY + cbH / 2, cbZ1], rot: [0, 0, 0] }, unfolded: { pos: [fW / 2, 0, fD + cbUnfoldBase + cbD / 2 + cbH / 2 + 200], rot: [-Math.PI / 2, 0, 0] } }
      );

      // Set initial state (folded)
      faces3D.forEach(f => {
        f.mesh.position.set(...f.folded.pos);
        f.mesh.rotation.set(...f.folded.rot);
      });

      // ---- Edge lines ----
      const edgeMat = new THREE.LineBasicMaterial({ color: 0x8B6914 });

      // Footing edges
      const footEdge = [
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(fW, 0, 0),
        new THREE.Vector3(fW, 0, fD), new THREE.Vector3(0, 0, fD), new THREE.Vector3(0, 0, 0),
      ];
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(footEdge), edgeMat));
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(footEdge.map(p => new THREE.Vector3(p.x, fH, p.z))), edgeMat));

      // Body edges
      const bx0 = fW / 2 - bW / 2, bx1 = fW / 2 + bW / 2;
      const bodyEdgeMat = new THREE.LineBasicMaterial({ color: 0x1e8449 });
      const bodyEdgeBot = [
        new THREE.Vector3(bx0, bodyBaseY, bodyZ0), new THREE.Vector3(bx1, bodyBaseY, bodyZ0),
        new THREE.Vector3(bx1, bodyBaseY, bodyZ1), new THREE.Vector3(bx0, bodyBaseY, bodyZ1), new THREE.Vector3(bx0, bodyBaseY, bodyZ0),
      ];
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(bodyEdgeBot), bodyEdgeMat));
      const bodyEdgeTop = bodyEdgeBot.map(p => new THREE.Vector3(p.x, bodyBaseY + bH, p.z));
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(bodyEdgeTop), bodyEdgeMat));

      // Cap beam edges
      const cbEdgeMat = new THREE.LineBasicMaterial({ color: 0xe67e22 });
      const cbx0 = fW / 2 - cbW / 2, cbx1 = fW / 2 + cbW / 2;
      const cbEdgeBot = [
        new THREE.Vector3(cbx0, cbBaseY, cbZ0), new THREE.Vector3(cbx1, cbBaseY, cbZ0),
        new THREE.Vector3(cbx1, cbBaseY, cbZ1), new THREE.Vector3(cbx0, cbBaseY, cbZ1), new THREE.Vector3(cbx0, cbBaseY, cbZ0),
      ];
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(cbEdgeBot), cbEdgeMat));
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(cbEdgeBot.map(p => new THREE.Vector3(p.x, cbBaseY + cbH, p.z))), cbEdgeMat));

      // ---- Construction joint lines (blue) ----
      const jointLineMat = new THREE.LineBasicMaterial({ color: 0x0000FF });

      // Footing to body
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(bx0, fH, bodyZ0), new THREE.Vector3(bx1, fH, bodyZ0),
        new THREE.Vector3(bx1, fH, bodyZ1), new THREE.Vector3(bx0, fH, bodyZ1), new THREE.Vector3(bx0, fH, bodyZ0),
      ]), jointLineMat));

      // Lift joints
      for (let i = 1; i < liftCount; i++) {
        const jy = bodyBaseY + liftH * i;
        scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(bx0, jy, bodyZ0), new THREE.Vector3(bx1, jy, bodyZ0),
          new THREE.Vector3(bx1, jy, bodyZ1), new THREE.Vector3(bx0, jy, bodyZ1), new THREE.Vector3(bx0, jy, bodyZ0),
        ]), jointLineMat));
      }

      // Body to cap beam
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(cbx0, cbBaseY, cbZ0), new THREE.Vector3(cbx1, cbBaseY, cbZ0),
        new THREE.Vector3(cbx1, cbBaseY, cbZ1), new THREE.Vector3(cbx0, cbBaseY, cbZ1), new THREE.Vector3(cbx0, cbBaseY, cbZ0),
      ]), jointLineMat));

      // ---- Construction joint planes (translucent blue) ----
      const jointsData = s.joints || {};
      const conJointsList = jointsData.construction_joints || s.construction_joints || [];
      const jointPlaneMat = new THREE.MeshLambertMaterial({ color: 0x0000FF, transparent: true, opacity: 0.12, side: THREE.DoubleSide });
      conJointsList.forEach(j => {
        const jHeight = j.height_mm;
        if (jHeight == null) return;
        // Determine plane size based on height position
        let planeW, planeD, px, pz;
        if (jHeight <= (footing.thickness_mm || 2500)) {
          // At footing level - use body dimensions
          planeW = bW + 200;
          planeD = bT + 200;
          px = fW / 2;
          pz = fD / 2;
        } else if (jHeight >= (fH + bH)) {
          // At cap beam level
          planeW = cbW + 200;
          planeD = cbD + 200;
          px = fW / 2;
          pz = fD / 2;
        } else {
          // Body level
          planeW = bW + 200;
          planeD = bT + 200;
          px = fW / 2;
          pz = fD / 2;
        }
        const jPlaneGeo = new THREE.PlaneGeometry(planeW, planeD);
        const jPlaneMesh = new THREE.Mesh(jPlaneGeo, jointPlaneMat);
        jPlaneMesh.rotation.x = -Math.PI / 2;
        jPlaneMesh.position.set(px, jHeight, pz);
        scene.add(jPlaneMesh);
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
      pdfDrawHeaderFooter(doc, '橋脚 全体確認図', 1, 3);
      const s = data.structure;
      const footing = s.footing || {};
      const body = s.body || {};
      const capBeam = s.cap_beam || {};
      let y = m + 35;
      doc.setFontSize(9);
      doc.setTextColor(0);
      doc.text(`構造物: ${s.name || '-'}`, m + 10, y); y += 7;
      doc.text(`フーチング: ${footing.width_mm || '-'}×${footing.depth_mm || '-'}×${footing.thickness_mm || '-'}mm`, m + 10, y); y += 7;
      doc.text(`躯体: ${body.shape === 'circular' ? '柱型' : '壁型'} ${body.width_mm || '-'}×${body.thickness_mm || '-'}×H${body.height_mm || '-'}mm、${body.lift_count || '-'}リフト（各${body.lift_height_mm || '-'}mm）`, m + 10, y); y += 7;
      doc.text(`梁部: ${capBeam.width_mm || '-'}×${capBeam.depth_mm || '-'}×H${capBeam.height_mm || '-'}mm、張出し${capBeam.cantilever_mm || '-'}mm`, m + 10, y); y += 10;

      // Lateral pressure summary
      doc.setFontSize(10);
      doc.setTextColor(230, 126, 34);
      doc.text('側圧計算結果', m + 10, y); y += 7;
      doc.setFontSize(8);
      doc.setTextColor(80);
      const liftH = body.lift_height_mm || 3000;
      const lp = this._calcLateralPressure(liftH);
      doc.text(`リフト高: ${liftH}mm → 側圧 P = ${lp.P} kN/m² → 推奨: ${lp.recDia} @${lp.recPitch}mm`, m + 15, y); y += 10;

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
            if (y > ph - 30) { doc.addPage('a3', 'landscape'); pdfDrawHeaderFooter(doc, '各面割付図（続き）', 2, 3); y = m + 30; }
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

      const filename = `${data.project?.name || 'pier'}_型枠割付_${data.project?.date || data.project?.created_at || 'draft'}.pdf`;
      doc.save(filename);
    }
  };

  registerModule('pier', PierModule);
})();
