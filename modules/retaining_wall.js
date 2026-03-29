// ============================================================
// 型知 KATACHI — 擁壁モジュール (retaining_wall.js)
// ============================================================

(function() {
  const RetainingWallModule = {
    type: 'retaining_wall',
    label: '擁壁',

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
    // Slope Separator Length Calculation
    // ============================================================
    calcSlopeSepTable(data) {
      const dim = data.structure?.dimensions || {};
      const cover = data.structure?.cover || {};
      const wH = dim.wall_height_mm || 3000;
      const tBot = dim.wall_thickness_bottom_mm || 300;
      const slope = dim.wall_slope || 0.05;
      const coverF = cover.front_face_mm || 40;
      const coverB = cover.back_face_soil_mm || 70;
      const pconDepth = 30; // Pcon depth (typical)

      // Find face A separator config for pitch
      let pitchV = 450;
      let rowPositions = [];
      for (const ph of (data.phases || [])) {
        for (const f of (ph.faces || [])) {
          if (f.id === 'A' && f.separators) {
            pitchV = f.separators.pitch_v_mm || 450;
            rowPositions = f.separators.row_positions_mm || [];
          }
        }
      }

      if (rowPositions.length === 0) {
        // Auto-generate row positions
        const edgeV = 225;
        for (let y = edgeV; y <= wH - edgeV; y += pitchV) {
          rowPositions.push(y);
        }
      }

      const rows = [];
      rowPositions.forEach((yPos, i) => {
        const wallThick = tBot - slope * yPos;
        const bLen = Math.round(wallThick + coverF * 2 + pconDepth * 2);
        const cLen = Math.round(wallThick);
        rows.push({
          row: i + 1,
          height_mm: yPos,
          wall_thickness_mm: Math.round(wallThick),
          b_type_length_mm: bLen,
          c_type_length_mm: cLen
        });
      });
      return rows;
    },

    // ============================================================
    // Overview
    // ============================================================
    buildOverview(data) {
      const s = data.structure;
      const dim = s.dimensions || {};
      const cover = s.cover || {};
      const cj = s.construction_joint?.base_to_wall || {};
      const drain = s.drain_pipe || {};
      const joints = s.joints || {};
      const conJoints = joints.construction_joints || [];

      const subtypeLabel = {
        'inverted_T': '逆T型',
        'L_type': 'L型',
        'gravity': '重力式'
      }[s.subtype] || s.subtype || '-';

      // Slope separator table
      const sepTable = this.calcSlopeSepTable(data);
      let sepTableRows = '';
      sepTable.forEach(r => {
        sepTableRows += `<tr>
          <td class="num">${r.row}</td>
          <td class="num">${r.height_mm}</td>
          <td class="num">${r.wall_thickness_mm}</td>
          <td class="num" style="color:#e74c3c;font-weight:bold">${r.b_type_length_mm}</td>
          <td class="num" style="color:#1a5276;font-weight:bold">${r.c_type_length_mm}</td>
        </tr>`;
      });

      // Face summary table
      let faceSummary = '';
      if (data.phases) {
        data.phases.forEach(ph => {
          (ph.faces || []).forEach(f => {
            const w = f.width_mm ? (f.width_mm / 1000).toFixed(1) + 'm' : '-';
            const h = f.height_mm ? f.height_mm + 'mm' : '-';
            const pc = f.panels ? f.panels.length : '-';
            const sc = f.separators ? f.separators.count || '-' : '-';
            const sepType = f.separators ? `${f.separators.type}${f.separators.symbol || ''}` : 'なし';
            faceSummary += `<tr><td>${esc(f.id)}</td><td>${esc(f.name || '')}</td><td>${w} × ${h}</td><td class="num">${pc}</td><td class="num">${sc}</td><td>${esc(sepType)}</td></tr>`;
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
                <h4>構造物情報</h4>
                <table>
                  <tr><td>タイプ</td><td>${esc(subtypeLabel)}</td></tr>
                  <tr><td>竪壁高さ</td><td>${dim.wall_height_mm || '-'}mm</td></tr>
                  <tr><td>壁厚（天端）</td><td>${dim.wall_thickness_top_mm || '-'}mm</td></tr>
                  <tr><td>壁厚（底部）</td><td>${dim.wall_thickness_bottom_mm || '-'}mm</td></tr>
                  <tr><td>前面勾配</td><td>1:${dim.wall_slope || '-'}</td></tr>
                  <tr><td>延長</td><td>${dim.length_mm ? (dim.length_mm / 1000).toFixed(1) + 'm' : '-'}</td></tr>
                </table>
              </div>
              <div class="info-box">
                <h4>底版</h4>
                <table>
                  <tr><td>底版幅</td><td>${dim.base_width_mm || '-'}mm</td></tr>
                  <tr><td>底版厚</td><td>${dim.base_thickness_mm || '-'}mm</td></tr>
                  <tr><td>つま先長</td><td>${dim.toe_length_mm || '-'}mm</td></tr>
                  <tr><td>かかと長</td><td>${dim.heel_length_mm || '-'}mm</td></tr>
                  <tr><td>型枠固定</td><td>控え杭（セパなし）</td></tr>
                </table>
              </div>
              <div class="info-box">
                <h4>打継ぎ情報</h4>
                <table>
                  <tr><td>位置</td><td>底版→竪壁</td></tr>
                  <tr><td>止水板</td><td>${cj.waterstop ? esc(cj.waterstop_type || 'あり') : 'なし'}</td></tr>
                  <tr><td>処理</td><td>${esc(cj.treatment || '-')}</td></tr>
                </table>
              </div>
              <div class="info-box">
                <h4>目地</h4>
                <table>
                  <tr><td>伸縮目地間隔</td><td>@${joints.expansion_joint_interval_mm || '-'}mm</td></tr>
                  <tr><td>目地材</td><td>${esc(joints.expansion_joint_material || '-')}</td></tr>
                  <tr><td>打継目地</td><td>${conJoints.length}箇所</td></tr>
                  ${conJoints.map(j => '<tr><td>\u3000' + esc(j.position) + '</td><td>' + esc(j.treatment||'') + '</td></tr>').join('')}
                  <tr><td>底版→壁 止水板</td><td>${cj.waterstop ? esc(cj.waterstop_type||'あり') : 'なし'}</td></tr>
                  <tr><td>備考</td><td>${esc(joints.note||'')}</td></tr>
                </table>
              </div>
              <div class="info-box">
                <h4>水抜きパイプ</h4>
                <table>
                  <tr><td>種類</td><td>${esc(drain.type || '-')}</td></tr>
                  <tr><td>配置間隔</td><td>${esc(drain.spacing || '-')}</td></tr>
                  <tr><td>勾配</td><td>${drain.slope_percent || '-'}%</td></tr>
                </table>
              </div>
              <div class="info-box">
                <h4>かぶり</h4>
                <table>
                  <tr><td>前面（仕上げ面）</td><td>${cover.front_face_mm || '-'}mm</td></tr>
                  <tr><td>背面（土に接する面）</td><td>${cover.back_face_soil_mm || '-'}mm</td></tr>
                  <tr><td>底版下面</td><td>${cover.base_bottom_mm || '-'}mm</td></tr>
                </table>
              </div>
              <div class="info-box">
                <h4>打設フェーズ（${data.phases ? data.phases.length : 0}回）</h4>
                <table>
                  <thead><tr><th></th><th>フェーズ名</th><th>面数</th></tr></thead>
                  <tbody>${phaseRows}</tbody>
                </table>
              </div>

              <div class="full">
                <div class="info-box" style="border:2px solid #e74c3c;background:#fff5f5">
                  <h4 style="color:#e74c3c;border-bottom-color:#e74c3c">勾配セパ長計算表（前面勾配 1:${dim.wall_slope || 0.05}）</h4>
                  <p style="font-size:11px;color:#666;margin-bottom:8px">
                    壁厚(h) = ${dim.wall_thickness_bottom_mm || 300} - ${dim.wall_slope || 0.05} × h(mm)&emsp;
                    B型セパ長 = 壁厚 + かぶり(${cover.front_face_mm || 40})×2 + Pコン深さ(30)×2&emsp;
                    C型セパ長 = 壁厚
                  </p>
                  <table class="qty-table">
                    <thead>
                      <tr>
                        <th>段数</th><th>高さ(mm)</th><th>壁厚(mm)</th>
                        <th style="color:#e74c3c">B型セパ長(mm) ●前面</th>
                        <th style="color:#1a5276">C型セパ長(mm) ○背面</th>
                      </tr>
                    </thead>
                    <tbody>${sepTableRows}</tbody>
                  </table>
                  <p style="font-size:11px;color:#e74c3c;margin-top:6px;font-weight:bold">
                    ※ 金物屋への発注時、上記の段別セパ長リストを必ず添付すること
                  </p>
                </div>
              </div>

              <div class="full">
                <div class="info-box">
                  <h4>面一覧</h4>
                  <table class="qty-table">
                    <thead><tr><th>面ID</th><th>面名</th><th>寸法</th><th>パネル数</th><th>セパ数</th><th>セパ種類</th></tr></thead>
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
      const dim = s.dimensions || {};

      const wH = dim.wall_height_mm || 3000;
      const tBot = dim.wall_thickness_bottom_mm || 300;
      const tTop = dim.wall_thickness_top_mm || 250;
      const slope = dim.wall_slope || 0.05;
      const baseW = dim.base_width_mm || 2500;
      const baseT = dim.base_thickness_mm || 500;
      const toeMm = dim.toe_length_mm || 500;
      const heelMm = dim.heel_length_mm || 1700;
      const drain = s.drain_pipe || {};

      const svgW = 620, svgH = 420;
      const marginL = 90, marginB = 50;

      // Scale
      const totalH = baseT + wH;
      const totalW = baseW;
      const scH = (svgH - marginB - 60) / totalH;
      const scW = (svgW - marginL - 140) / totalW;
      const sc = Math.min(scH, scW, 0.08);

      const baseY = svgH - marginB;

      // Base slab
      const bW = baseW * sc;
      const bH = baseT * sc;
      const bToe = toeMm * sc;
      const bHeel = heelMm * sc;

      // Wall
      const wallH = wH * sc;
      const wallTBot = tBot * sc;
      const wallTTop = tTop * sc;

      const baseLeft = marginL;
      const baseRight = baseLeft + bW;
      const baseTop = baseY - bH;

      // Wall sits on base slab, left edge at toe offset
      const wallLeft = baseLeft + bToe;
      const wallRight = wallLeft + wallTBot;
      const wallTop = baseTop - wallH;

      // Front face is sloped (wall thins towards top)
      // Back face is vertical at wallRight
      // Front face at bottom = wallLeft, at top = wallLeft + (tBot - tTop) * sc = wallLeft + slope * wH * sc
      const wallTopLeft = wallLeft + (tBot - tTop) * sc;
      const wallTopRight = wallRight; // back face vertical

      let svg = `<svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg" style="font-family:'BIZ UDPGothic','Meiryo',sans-serif">`;

      // Ground line
      svg += `<line x1="0" y1="${baseY}" x2="${svgW}" y2="${baseY}" stroke="#8B4513" stroke-width="2" stroke-dasharray="8,4"/>`;
      svg += `<text x="10" y="${baseY + 14}" font-size="9" fill="#8B4513">G.L.</text>`;

      // ---- Base slab (blue-tint) ----
      svg += `<rect x="${baseLeft}" y="${baseTop}" width="${bW}" height="${bH}" fill="#d6eaf8" stroke="#1a5276" stroke-width="1.5"/>`;
      svg += `<text x="${baseLeft + bW / 2}" y="${baseTop + bH / 2 + 4}" text-anchor="middle" font-size="10" fill="#1a5276" font-weight="bold">底版</text>`;

      // Toe / Heel labels
      svg += `<text x="${baseLeft + bToe / 2}" y="${baseTop - 3}" text-anchor="middle" font-size="7" fill="#666">つま先</text>`;
      svg += `<text x="${wallRight + (baseRight - wallRight) / 2}" y="${baseTop - 3}" text-anchor="middle" font-size="7" fill="#666">かかと</text>`;

      // Face labels on base
      svg += `<text x="${baseLeft - 3}" y="${baseTop + bH / 2}" text-anchor="end" font-size="8" fill="#e74c3c">E面→</text>`;
      svg += `<text x="${baseRight + 3}" y="${baseTop + bH / 2}" text-anchor="start" font-size="8" fill="#e74c3c">←F面</text>`;

      // ---- Vertical wall (green-tint, front face sloped) ----
      const wallPts = `${wallLeft},${baseTop} ${wallRight},${baseTop} ${wallTopRight},${wallTop} ${wallTopLeft},${wallTop}`;
      svg += `<polygon points="${wallPts}" fill="#d5f5e3" stroke="#1e8449" stroke-width="1.5"/>`;
      svg += `<text x="${(wallLeft + wallRight) / 2}" y="${baseTop - wallH / 2 + 4}" text-anchor="middle" font-size="10" fill="#1e8449" font-weight="bold">竪壁</text>`;

      // Slope label on front face
      const slopeMidX = (wallLeft + wallTopLeft) / 2 - 5;
      const slopeMidY = (baseTop + wallTop) / 2;
      svg += `<text x="${slopeMidX}" y="${slopeMidY}" text-anchor="end" font-size="8" fill="#e67e22" transform="rotate(-3,${slopeMidX},${slopeMidY})">勾配1:${slope}</text>`;

      // Face labels on wall
      svg += `<text x="${wallTopLeft - 12}" y="${baseTop - wallH / 2}" text-anchor="end" font-size="8" fill="#e74c3c">A面→</text>`;
      svg += `<text x="${wallTopLeft - 12}" y="${baseTop - wallH / 2 + 10}" text-anchor="end" font-size="7" fill="#e74c3c">B型●</text>`;
      svg += `<text x="${wallRight + 12}" y="${baseTop - wallH / 2}" text-anchor="start" font-size="8" fill="#e74c3c">←B面</text>`;
      svg += `<text x="${wallRight + 12}" y="${baseTop - wallH / 2 + 10}" text-anchor="start" font-size="7" fill="#e74c3c">C型○</text>`;

      // ---- Separator positions (varying lengths) ----
      const sepTable = this.calcSlopeSepTable(data);
      sepTable.forEach((r, i) => {
        const yPos = baseTop - (r.height_mm * sc);
        // Horizontal line showing separator across wall
        const xAtH = wallLeft + ((tBot - r.wall_thickness_mm) * sc); // front face x at this height
        // Draw small separator line
        svg += `<line x1="${xAtH - 6}" y1="${yPos}" x2="${wallRight + 6}" y2="${yPos}" stroke="#999" stroke-width="0.5" stroke-dasharray="2,2"/>`;
        // B-type filled circle on front
        svg += `<circle cx="${xAtH - 3}" cy="${yPos}" r="2.5" fill="#e74c3c" stroke="#e74c3c" stroke-width="0.5"/>`;
        // C-type open circle on back
        svg += `<circle cx="${wallRight + 3}" cy="${yPos}" r="2.5" fill="none" stroke="#1a5276" stroke-width="1"/>`;
      });

      // ---- Drain pipe position ----
      const drainPipes = [];
      for (const ph of (data.phases || [])) {
        for (const f of (ph.faces || [])) {
          if (f.id === 'A' && f.drain_pipes) {
            f.drain_pipes.forEach(dp => drainPipes.push(dp));
          }
        }
      }
      if (drainPipes.length > 0) {
        const dpY = baseTop - (drainPipes[0].y_mm || 300) * sc;
        const dpSize = 6;
        svg += `<rect x="${wallLeft - dpSize - 2}" y="${dpY - dpSize / 2}" width="${dpSize}" height="${dpSize}" fill="#2196F3" stroke="#0D47A1" stroke-width="0.8"/>`;
        svg += `<text x="${wallLeft - dpSize - 5}" y="${dpY + 3}" text-anchor="end" font-size="7" fill="#0D47A1">${esc(drain.type || 'VP75')}</text>`;
        // Arrow showing drain slope
        svg += `<line x1="${wallLeft - dpSize - 2}" y1="${dpY}" x2="${wallLeft - dpSize - 14}" y2="${dpY + 3}" stroke="#0D47A1" stroke-width="0.8" marker-end=""/>`;
      }

      // ---- Construction joint line (blue dashed) ----
      svg += `<line x1="${wallLeft - 8}" y1="${baseTop}" x2="${wallRight + 8}" y2="${baseTop}" stroke="#0000FF" stroke-width="2" stroke-dasharray="6,3"/>`;
      svg += `<text x="${wallRight + 12}" y="${baseTop + 4}" font-size="7" fill="#0000FF">打継目地</text>`;

      // ---- Dimension Lines ----

      // Base width (horizontal)
      const dimBaseY = baseY + 18;
      svg += dimLine(baseLeft, dimBaseY, baseRight, dimBaseY, `${baseW}mm`);

      // Toe length
      const dimToeY = baseY + 34;
      svg += dimLine(baseLeft, dimToeY, baseLeft + bToe, dimToeY, `${toeMm}`);

      // Wall thickness at bottom
      svg += dimLine(wallLeft, dimToeY, wallRight, dimToeY, `${tBot}`);

      // Heel length
      svg += dimLine(wallRight, dimToeY, baseRight, dimToeY, `${heelMm}`);

      // Base thickness (vertical)
      const dimBaseVx = baseLeft - 18;
      svg += dimLineV(dimBaseVx, baseTop, dimBaseVx, baseY, `${baseT}`);

      // Wall height (vertical)
      const dimWallVx = baseLeft - 50;
      svg += dimLineV(dimWallVx, wallTop, dimWallVx, baseTop, `${wH}`);

      // Total height
      const dimTotalVx = baseLeft - 75;
      svg += dimLineV(dimTotalVx, wallTop, dimTotalVx, baseY, `${totalH}mm`);

      // Wall thickness labels
      svg += `<text x="${(wallTopLeft + wallTopRight) / 2}" y="${wallTop + 12}" text-anchor="middle" font-size="7" fill="#666">t=${tTop}</text>`;
      svg += `<text x="${(wallLeft + wallRight) / 2}" y="${baseTop + 12}" text-anchor="middle" font-size="7" fill="#666">t=${tBot}</text>`;

      // Backfill hatching (right side of wall, simplified)
      const hatchStartX = wallRight + 15;
      const hatchEndX = baseRight;
      for (let hy = wallTop; hy < baseTop; hy += 12) {
        svg += `<line x1="${hatchStartX}" y1="${hy}" x2="${Math.min(hatchStartX + 15, hatchEndX)}" y2="${hy + 8}" stroke="#8B7355" stroke-width="0.3"/>`;
      }
      svg += `<text x="${hatchStartX + 8}" y="${wallTop + 15}" font-size="7" fill="#8B7355">埋戻し土</text>`;

      // ---- Legend ----
      svg += `<rect x="${svgW - 150}" y="10" width="140" height="105" fill="#fff" stroke="#ddd" stroke-width="0.5" rx="4"/>`;
      svg += `<text x="${svgW - 145}" y="24" font-size="9" fill="#333" font-weight="bold">凡例</text>`;
      svg += `<rect x="${svgW - 145}" y="30" width="12" height="10" fill="#d6eaf8" stroke="#1a5276" stroke-width="0.5"/>`;
      svg += `<text x="${svgW - 128}" y="39" font-size="8" fill="#333">底版</text>`;
      svg += `<rect x="${svgW - 145}" y="45" width="12" height="10" fill="#d5f5e3" stroke="#1e8449" stroke-width="0.5"/>`;
      svg += `<text x="${svgW - 128}" y="54" font-size="8" fill="#333">竪壁（前面勾配）</text>`;
      svg += `<line x1="${svgW - 145}" y1="65" x2="${svgW - 133}" y2="65" stroke="#0000FF" stroke-width="1.5" stroke-dasharray="4,2"/>`;
      svg += `<text x="${svgW - 128}" y="68" font-size="8" fill="#333">打継目地</text>`;
      svg += `<circle cx="${svgW - 139}" cy="80" r="3" fill="#e74c3c" stroke="#e74c3c" stroke-width="0.5"/>`;
      svg += `<text x="${svgW - 128}" y="83" font-size="8" fill="#333">B型セパ ●（前面）</text>`;
      svg += `<circle cx="${svgW - 139}" cy="95" r="3" fill="none" stroke="#1a5276" stroke-width="1"/>`;
      svg += `<text x="${svgW - 128}" y="98" font-size="8" fill="#333">C型セパ ○（背面）</text>`;
      svg += `<rect x="${svgW - 145}" y="104" width="8" height="8" fill="#2196F3" stroke="#0D47A1" stroke-width="0.5"/>`;
      svg += `<text x="${svgW - 128}" y="112" font-size="8" fill="#333">水抜き ${esc(drain.type || 'VP75')}</text>`;

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
      const isBase = (face.id === 'E' || face.id === 'F');
      const isWallFront = (face.id === 'A');
      const isWallBack = (face.id === 'B');
      const isEndForm = (face.id === 'C' || face.id === 'D');

      let componentLabel = '底版';
      let componentColor = '#1a5276';
      if (isWallFront || isWallBack || isEndForm) { componentLabel = '竪壁'; componentColor = '#1e8449'; }

      const supportInfo = face.support
        ? `<tr><td>控え</td><td>${esc(face.support.type)} ${esc(face.support.spec || '')}</td></tr>`
        : '';

      // Separator info with slope table for wall faces
      let sepInfo = '';
      if (sep.type) {
        let slopeSepHtml = '';
        if (sep.lengths_by_row_mm && sep.lengths_by_row_mm.length > 0) {
          slopeSepHtml = `<tr><td>段別セパ長</td><td style="color:#e74c3c">`;
          sep.lengths_by_row_mm.forEach((len, i) => {
            slopeSepHtml += `${i + 1}段:${len}mm `;
          });
          slopeSepHtml += `</td></tr>`;
        }
        sepInfo = `<table>
          <tr><td>種類</td><td>${esc(sep.type)} ${esc(sep.symbol || '')} ${esc(sep.diameter || '')}</td></tr>
          <tr><td>水平ピッチ</td><td>@${sep.pitch_h_mm || '-'}mm</td></tr>
          <tr><td>垂直ピッチ</td><td>@${sep.pitch_v_mm || '-'}mm</td></tr>
          <tr><td>段数</td><td>${sep.rows || '-'}段</td></tr>
          <tr><td>本数</td><td>${sep.count || '-'}本</td></tr>
          ${slopeSepHtml}
          ${sep.note ? `<tr><td>備考</td><td style="color:#e74c3c">${esc(sep.note)}</td></tr>` : ''}
        </table>`;
      } else {
        sepInfo = `<p style="font-size:12px;color:#999">セパレーターなし（控え杭で固定）</p>`;
      }

      // Drain pipe info for face A
      let drainInfo = '';
      if (isWallFront && face.drain_pipes && face.drain_pipes.length > 0) {
        drainInfo = `<div class="info-box full">
          <h4 style="color:#0D47A1">水抜きパイプ配置</h4>
          <table>
            <tr><td>種類</td><td>${esc(data.structure?.drain_pipe?.type || 'VP75')}</td></tr>
            <tr><td>箇所数</td><td>${face.drain_pipes.length}箇所</td></tr>
            <tr><td>位置</td><td>${face.drain_pipes.map(dp => `X=${dp.x_mm}mm, Y=${dp.y_mm}mm`).join(' / ')}</td></tr>
          </table>
        </div>`;
      }

      container.innerHTML = `
        <div class="card">
          <div class="card-header">${esc(face.id)}面 — ${esc(face.name || '')}
            <span class="badge" style="background:${componentColor}">${componentLabel}</span>
            ${phase ? `<span class="badge gray">Phase ${phase.phase}</span>` : ''}
            ${sep.type ? `<span class="badge" style="background:${sep.type === 'B型' ? '#e74c3c' : '#1a5276'}">${sep.type}${sep.symbol || ''}</span>` : ''}
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
                ${sepInfo}
              </div>
              ${drainInfo}
              ${isBase ? `<div class="info-box full">
                <h4>底版型枠注意</h4>
                <p style="font-size:12px;color:#1a5276;font-weight:bold">H${face.height_mm || 550}mmの低い型枠。セパなし、木杭控え＋ステーで固定。</p>
              </div>` : ''}
              ${isWallFront && sep.note ? `<div class="info-box full">
                <h4 style="color:#e74c3c">勾配セパ注意</h4>
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

      const faceW = face.width_mm || 10000;
      const faceH = face.height_mm || 3000;
      const sep = face.separators || {};
      const isBase = (faceId === 'E' || faceId === 'F');
      const isWallFront = (faceId === 'A');
      const isWallBack = (faceId === 'B');

      const maxRow = panels.reduce((m, p) => Math.max(m, p.row || 1), 1);

      // Drawing area
      const marginL = 65, marginR = 80, marginT = 30, marginB = 100;
      const drawW = Math.max(500, Math.min(1100, panels.length * 60));
      const drawH = Math.max(150, Math.min(400, faceH * 0.08));
      const svgW = drawW + marginL + marginR;
      const svgH = drawH + marginT + marginB;
      const scaleX = drawW / faceW;
      const scaleY = drawH / faceH;

      let svg = `<svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg" style="font-family:'BIZ UDPGothic','Meiryo',sans-serif">`;

      // Background
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
            rowHeights[r] = rowGroups[r][0].height_mm || 1800;
          });
          const totalPanelH = Object.values(rowHeights).reduce((s, h) => s + h, 0);

          let yOff = 0;
          for (let r = 1; r <= maxRow; r++) {
            const rowPanels = rowGroups[r] || [];
            const rowH = (rowHeights[r] || 1800);
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

            // Row boundary line
            if (r < maxRow) {
              svg += `<line x1="${marginL}" y1="${marginT + yOff + rowDrawH}" x2="${marginL + drawW}" y2="${marginT + yOff + rowDrawH}" stroke="#666" stroke-width="0.8" stroke-dasharray="4,2"/>`;
              svg += `<text x="${marginL + drawW + 5}" y="${marginT + yOff + rowDrawH + 4}" font-size="7" fill="#666">${r}段/${r + 1}段</text>`;
            }

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
        const isBType = (sep.type === 'B型');

        for (let x = edgeM; x <= faceW - edgeM + 1; x += pitchH) {
          const sx = marginL + x * scaleX;
          rowPositions.forEach(ry => {
            const sy = marginT + (faceH - ry) * scaleY;
            if (isBType) {
              // B-type: filled circle
              svg += `<circle cx="${sx}" cy="${sy}" r="3.5" fill="#e74c3c" stroke="#e74c3c" stroke-width="0.5"/>`;
            } else {
              // C-type: open circle
              svg += `<circle cx="${sx}" cy="${sy}" r="3.5" fill="none" stroke="#1a5276" stroke-width="1.2"/>`;
            }
          });
        }

        // Legend in diagram
        if (isBType) {
          svg += `<text x="${marginL + drawW + 5}" y="${marginT + 15}" font-size="8" fill="#e74c3c" font-weight="bold">● B型セパ</text>`;
          svg += `<text x="${marginL + drawW + 5}" y="${marginT + 27}" font-size="7" fill="#e74c3c">Pコン仕上げ</text>`;
        } else {
          svg += `<text x="${marginL + drawW + 5}" y="${marginT + 15}" font-size="8" fill="#1a5276" font-weight="bold">○ C型セパ</text>`;
          svg += `<text x="${marginL + drawW + 5}" y="${marginT + 27}" font-size="7" fill="#1a5276">ナット式</text>`;
        }
      }

      // Drain pipes on face A
      if (isWallFront && showSeparators && face.drain_pipes) {
        face.drain_pipes.forEach(dp => {
          const dx = marginL + dp.x_mm * scaleX;
          const dy = marginT + (faceH - dp.y_mm) * scaleY;
          const dpSize = 8;
          svg += `<rect x="${dx - dpSize / 2}" y="${dy - dpSize / 2}" width="${dpSize}" height="${dpSize}" fill="#2196F3" fill-opacity="0.4" stroke="#0D47A1" stroke-width="1.2"/>`;
          svg += `<text x="${dx}" y="${dy + dpSize / 2 + 10}" text-anchor="middle" font-size="6" fill="#0D47A1">${esc(dp.type)}</text>`;
        });
      }

      // Joint lines
      const jointsData = appData?.structure?.joints || {};
      const conJointsArr = jointsData.construction_joints || [];
      if (showDimensions) {
        // Construction joints - blue dashed horizontal (for wall faces)
        if ((isWallFront || isWallBack) && conJointsArr.length > 0) {
          svg += `<line x1="${marginL}" y1="${marginT+drawH}" x2="${marginL+drawW}" y2="${marginT+drawH}" stroke="#0000FF" stroke-width="1.5" stroke-dasharray="6,3"/>`;
          svg += `<text x="${marginL+drawW+5}" y="${marginT+drawH+3}" font-size="7" fill="#0000FF">打継目地</text>`;
        }
        // Expansion joints - red double vertical lines
        const expJoints = jointsData.expansion_joints || [];
        expJoints.forEach(j => {
          if (j.position_mm === undefined) return;
          const jx = marginL + j.position_mm * scaleX;
          svg += `<line x1="${jx-1}" y1="${marginT-5}" x2="${jx-1}" y2="${marginT+drawH+5}" stroke="#FF0000" stroke-width="2"/>`;
          svg += `<line x1="${jx+1}" y1="${marginT-5}" x2="${jx+1}" y2="${marginT+drawH+5}" stroke="#FF0000" stroke-width="2"/>`;
          svg += `<text x="${jx}" y="${marginT-8}" text-anchor="middle" font-size="8" fill="#FF0000">伸縮目地</text>`;
        });
      }

      // Base support note
      if (isBase && showDimensions) {
        svg += `<text x="${marginL + drawW / 2}" y="${marginT - 5}" text-anchor="middle" font-size="8" fill="#1a5276" font-weight="bold">※ セパなし — 控え杭＋ステーで固定</text>`;
      }

      // Slope note for wall front
      if (isWallFront && showDimensions) {
        svg += `<text x="${marginL + drawW / 2}" y="${marginT - 5}" text-anchor="middle" font-size="8" fill="#e74c3c" font-weight="bold">前面勾配 1:${appData?.structure?.dimensions?.wall_slope || 0.05} — 勾配セパ（段ごとにセパ長が異なる）</text>`;
      }

      // Back face note
      if (isWallBack && showDimensions) {
        svg += `<text x="${marginL + drawW / 2}" y="${marginT - 5}" text-anchor="middle" font-size="8" fill="#1a5276" font-weight="bold">背面（埋戻し面）— C型セパ ○ ナット式</text>`;
      }

      // Dimensions
      if (showDimensions) {
        const dimY1 = marginT + drawH + 16;
        const dimY2 = dimY1 + 22;

        // Total width
        svg += dimLine(marginL, dimY1, marginL + drawW, dimY1, `${faceW.toLocaleString()}mm`);

        // Panel widths (single row, avoid clutter)
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
          svg += `<text x="${marginL + drawW / 2}" y="${dimY3}" text-anchor="middle" font-size="9" fill="${sep.type === 'B型' ? '#e74c3c' : '#1a5276'}">@${sep.pitch_h_mm}（${sep.type}${sep.symbol || ''} セパピッチ）</text>`;
        }

        // Height dimension
        svg += dimLineV(marginL - 10, marginT, marginL - 10, marginT + drawH, `${faceH}mm`);

        // Sepa row labels
        if (sep.row_positions_mm && sep.rows > 1) {
          sep.row_positions_mm.forEach((ry, i) => {
            const sy = marginT + (faceH - ry) * scaleY;
            const lenLabel = sep.lengths_by_row_mm ? ` L=${sep.lengths_by_row_mm[i]}` : '';
            svg += `<text x="${marginL + drawW + 5}" y="${sy + 3 + 36}" font-size="7" fill="${sep.type === 'B型' ? '#e74c3c' : '#1a5276'}">${i + 1}段 ${ry}mm${lenLabel}</text>`;
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

      const length = dim.length_mm || 10000;     // X direction (along wall)
      const baseW = dim.base_width_mm || 2500;   // Z direction (across wall)
      const baseT = dim.base_thickness_mm || 500; // Y direction
      const wallH = dim.wall_height_mm || 3000;
      const tBot = dim.wall_thickness_bottom_mm || 300;
      const tTop = dim.wall_thickness_top_mm || 250;
      const toeMm = dim.toe_length_mm || 500;

      // Camera
      set3DCameraTarget(length / 2, (baseT + wallH) / 2, baseW / 2, Math.max(length, baseW, wallH) * 1.2);

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
      const groundGeo = new THREE.PlaneGeometry(length + 4000, baseW + 4000);
      const groundMat = new THREE.MeshLambertMaterial({ color: 0x8B7355, transparent: true, opacity: 0.3 });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(length / 2, -10, baseW / 2);
      scene.add(ground);

      // ---- Base slab (translucent) ----
      const baseGeo = new THREE.BoxGeometry(length, baseT, baseW);
      const baseMat = new THREE.MeshLambertMaterial({ color: 0xd6eaf8, transparent: true, opacity: 0.25 });
      const baseMesh = new THREE.Mesh(baseGeo, baseMat);
      baseMesh.position.set(length / 2, baseT / 2, baseW / 2);
      scene.add(baseMesh);

      // ---- Vertical wall (translucent) ----
      const wallAvgT = (tBot + tTop) / 2;
      const wallZ0 = toeMm;
      const wallZcenter = wallZ0 + tBot / 2;
      const wallGeo = new THREE.BoxGeometry(length, wallH, wallAvgT);
      const wallMat = new THREE.MeshLambertMaterial({ color: 0xd5f5e3, transparent: true, opacity: 0.2 });
      const wallMesh = new THREE.Mesh(wallGeo, wallMat);
      wallMesh.position.set(length / 2, baseT + wallH / 2, wallZcenter);
      scene.add(wallMesh);

      // ---- Formwork face meshes ----
      const eFace = ff('E');
      const fFace = ff('F');
      const aFace = ff('A');
      const bFace = ff('B');
      const cFace = ff('C');
      const dFace = ff('D');

      const eMesh = createFaceMesh(eFace, length, baseT);
      const fMesh = createFaceMesh(fFace, length, baseT);
      const aMesh = createFaceMesh(aFace, length, wallH);
      const bMesh = createFaceMesh(bFace, length, wallH);
      const cMesh = createFaceMesh(cFace, tBot, wallH);
      const dMesh = createFaceMesh(dFace, tBot, wallH);

      [eMesh, fMesh, aMesh, bMesh, cMesh, dMesh].forEach(m => scene.add(m));

      // ---- Construction joint line (blue) ----
      const jointLineMat = new THREE.LineBasicMaterial({ color: 0x0000FF });
      const jy = baseT;
      const jpts = [
        new THREE.Vector3(0, jy, wallZ0),
        new THREE.Vector3(length, jy, wallZ0),
        new THREE.Vector3(length, jy, wallZ0 + tBot),
        new THREE.Vector3(0, jy, wallZ0 + tBot),
        new THREE.Vector3(0, jy, wallZ0),
      ];
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(jpts), jointLineMat));

      // ---- Construction joint plane (blue translucent) ----
      const cjPlaneGeo = new THREE.PlaneGeometry(length, tBot);
      const cjPlaneMat = new THREE.MeshLambertMaterial({ color: 0x0000FF, transparent: true, opacity: 0.12, side: THREE.DoubleSide });
      const cjPlane = new THREE.Mesh(cjPlaneGeo, cjPlaneMat);
      cjPlane.rotation.x = -Math.PI / 2;
      cjPlane.position.set(length / 2, jy, wallZ0 + tBot / 2);
      scene.add(cjPlane);

      // ---- Expansion joint planes (red, if any) ----
      const jointsData3D = s.joints || {};
      const expJoints3D = jointsData3D.expansion_joints || [];
      expJoints3D.forEach(j => {
        if (j.position_mm === undefined) return;
        const ejGeo = new THREE.PlaneGeometry(tBot, baseT + wallH);
        const ejMat = new THREE.MeshLambertMaterial({ color: 0xFF0000, transparent: true, opacity: 0.18, side: THREE.DoubleSide });
        const ejMesh = new THREE.Mesh(ejGeo, ejMat);
        ejMesh.rotation.y = Math.PI / 2;
        ejMesh.position.set(j.position_mm, (baseT + wallH) / 2, wallZ0 + tBot / 2);
        scene.add(ejMesh);
        // Red edge line
        const ejLineMat = new THREE.LineBasicMaterial({ color: 0xFF0000 });
        const ejPts = [
          new THREE.Vector3(j.position_mm, 0, wallZ0),
          new THREE.Vector3(j.position_mm, baseT + wallH, wallZ0),
          new THREE.Vector3(j.position_mm, baseT + wallH, wallZ0 + tBot),
          new THREE.Vector3(j.position_mm, 0, wallZ0 + tBot),
          new THREE.Vector3(j.position_mm, 0, wallZ0),
        ];
        scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ejPts), ejLineMat));
      });

      // ---- Edge lines for base ----
      const edgeMat = new THREE.LineBasicMaterial({ color: 0x8B6914 });
      const baseEdge = [
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(length, 0, 0),
        new THREE.Vector3(length, 0, baseW), new THREE.Vector3(0, 0, baseW), new THREE.Vector3(0, 0, 0),
      ];
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(baseEdge), edgeMat));
      const baseEdgeTop = baseEdge.map(p => new THREE.Vector3(p.x, baseT, p.z));
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(baseEdgeTop), edgeMat));

      // ---- 3D face positions (folded/unfolded) ----
      const faces3D = [
        // Base front (E face, Z=0 side, toe side)
        {
          mesh: eMesh,
          folded: { pos: [length / 2, baseT / 2, 0], rot: [0, Math.PI, 0] },
          unfolded: { pos: [length / 2, 0, -baseT / 2 - 200], rot: [-Math.PI / 2, 0, 0] }
        },
        // Base back (F face, Z=baseW side, heel side)
        {
          mesh: fMesh,
          folded: { pos: [length / 2, baseT / 2, baseW], rot: [0, 0, 0] },
          unfolded: { pos: [length / 2, 0, baseW + baseT / 2 + 200], rot: [-Math.PI / 2, 0, 0] }
        },
        // Wall front (A face, front/toe side)
        {
          mesh: aMesh,
          folded: { pos: [length / 2, baseT + wallH / 2, wallZ0], rot: [0, Math.PI, 0] },
          unfolded: { pos: [length / 2, 0, -baseT - wallH / 2 - 400], rot: [-Math.PI / 2, 0, 0] }
        },
        // Wall back (B face, back/heel side)
        {
          mesh: bMesh,
          folded: { pos: [length / 2, baseT + wallH / 2, wallZ0 + tBot], rot: [0, 0, 0] },
          unfolded: { pos: [length / 2, 0, baseW + baseT + wallH / 2 + 400], rot: [-Math.PI / 2, 0, 0] }
        },
        // End form left (C face, X=0)
        {
          mesh: cMesh,
          folded: { pos: [0, baseT + wallH / 2, wallZcenter], rot: [0, -Math.PI / 2, 0] },
          unfolded: { pos: [-tBot / 2 - 200, 0, wallZcenter], rot: [-Math.PI / 2, 0, 0] }
        },
        // End form right (D face, X=length)
        {
          mesh: dMesh,
          folded: { pos: [length, baseT + wallH / 2, wallZcenter], rot: [0, Math.PI / 2, 0] },
          unfolded: { pos: [length + tBot / 2 + 200, 0, wallZcenter], rot: [-Math.PI / 2, 0, 0] }
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

      const s = data.structure;
      const dim = s.dimensions || {};
      const cj = s.construction_joint?.base_to_wall || {};
      const drain = s.drain_pipe || {};

      // Page 1: Overview + Cross Section + Slope Sep Table
      pdfDrawHeaderFooter(doc, '擁壁 全体確認図', 1, 3);
      let y = m + 35;
      doc.setFontSize(9);
      doc.setTextColor(0);
      doc.text(`構造物: ${s.name || '-'}（${s.subtype || '-'}）`, m + 10, y); y += 7;
      doc.text(`竪壁: H${dim.wall_height_mm || '-'}mm、天端${dim.wall_thickness_top_mm || '-'}mm / 底部${dim.wall_thickness_bottom_mm || '-'}mm、前面勾配1:${dim.wall_slope || '-'}`, m + 10, y); y += 7;
      doc.text(`底版: ${dim.base_width_mm || '-'}mm幅 × ${dim.base_thickness_mm || '-'}mm厚、つま先${dim.toe_length_mm || '-'}mm / かかと${dim.heel_length_mm || '-'}mm`, m + 10, y); y += 7;
      doc.text(`延長: ${dim.length_mm ? (dim.length_mm / 1000).toFixed(1) + 'm' : '-'}`, m + 10, y); y += 7;
      doc.text(`打継ぎ: ${cj.treatment || '-'}、止水板: ${cj.waterstop ? cj.waterstop_type || 'あり' : 'なし'}`, m + 10, y); y += 7;
      doc.text(`水抜き: ${drain.type || '-'} ${drain.spacing || '-'}`, m + 10, y); y += 10;

      // Slope separator table in PDF
      doc.setFontSize(10);
      doc.setTextColor(200, 50, 50);
      doc.text('勾配セパ長計算表', m + 10, y); y += 6;
      doc.setFontSize(7);
      doc.setTextColor(80);
      doc.text('段数', m + 15, y);
      doc.text('高さ(mm)', m + 35, y);
      doc.text('壁厚(mm)', m + 60, y);
      doc.text('B型セパ長(mm)', m + 85, y);
      doc.text('C型セパ長(mm)', m + 115, y);
      y += 4;
      doc.line(m + 10, y, m + 145, y); y += 3;

      const sepTable = this.calcSlopeSepTable(data);
      sepTable.forEach(r => {
        doc.text(`${r.row}`, m + 18, y);
        doc.text(`${r.height_mm}`, m + 40, y);
        doc.text(`${r.wall_thickness_mm}`, m + 65, y);
        doc.setTextColor(200, 50, 50);
        doc.text(`${r.b_type_length_mm}`, m + 92, y);
        doc.setTextColor(26, 82, 118);
        doc.text(`${r.c_type_length_mm}`, m + 122, y);
        doc.setTextColor(80);
        y += 5;
      });
      y += 5;

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
            const sepLabel = sep.type ? `${sep.type}${sep.symbol || ''} ${sep.count || 0}本` : 'セパなし';
            doc.text(`  ${face.id}面: ${face.name} — ${face.width_mm ? (face.width_mm / 1000).toFixed(1) + 'm' : '-'} × ${face.height_mm || '-'}mm — パネル${face.panels?.length || 0}枚 — ${sepLabel}`, m + 10, y);
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
        doc.text(`${r.face}: ${r.type} ${r.diameter} L=${r.length_mm} × ${r.count}本 ${r.note || ''}`, m + 15, y);
        y += 5;
      });
      y += 3;
      doc.setFontSize(9);
      doc.text(`セパ合計: ${q.separators?.total_count || 0}本`, m + 15, y);

      const filename = `${data.project?.name || 'retaining_wall'}_型枠割付_${data.project?.created_at || 'draft'}.pdf`;
      doc.save(filename);
    }
  };

  registerModule('retaining_wall', RetainingWallModule);
})();
