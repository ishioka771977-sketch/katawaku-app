// ============================================================
// 型知 KATACHI — 床版モジュール (slab.js)
// ============================================================

(function() {
  const SlabModule = {
    type: 'deck_slab',
    label: '床版',

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
        if (face && face.face_type !== 'haunch') {
          this.renderFaceDiagram(faceId, face);
        }
      }
    },

    // ============================================================
    // Overview
    // ============================================================
    buildOverview(data) {
      const s = data.structure;
      const d = s.dimensions || {};
      const g = s.girders || {};
      const bp = s.base_plate || {};
      const fc = s.formwork_config || {};
      const joints = s.joints || {};
      const conJoints = joints.construction_joints || [];
      const expJoints = joints.expansion_joints || [];

      let faceSummary = '';
      if (data.phases) {
        data.phases.forEach(ph => {
          (ph.faces||[]).forEach(f => {
            const w = f.width_mm ? (f.width_mm/1000).toFixed(1)+'m' : '-';
            const h = f.height_mm ? f.height_mm+'mm' : '-';
            const pc = f.panels ? f.panels.length : (f.total_panels||'-');
            const sc = f.separators ? f.separators.count : '-';
            faceSummary += `<tr><td>${esc(f.id)}</td><td>${esc(f.name||'')}</td><td>${w} × ${h}</td><td class="num">${pc}</td><td class="num">${sc}</td></tr>`;
          });
        });
      }

      let notesHtml = '';
      (data.notes||[]).forEach(n => {
        notesHtml += `<div class="note-card"><div class="note-cat">${esc(n.category)}</div><div class="note-text">${esc(n.content)}</div></div>`;
      });

      const el = document.getElementById('view-overview');
      el.innerHTML = `
        <div class="card"><div class="card-header">全体確認図 — ${esc(data.project?.name||'')}</div><div class="card-body">
          <div class="overview-grid">
            <div class="info-box">
              <h4>構造物情報</h4>
              <table>
                <tr><td>形式</td><td>${esc(s.subtype||s.type||'')}</td></tr>
                <tr><td>橋幅</td><td>${d.width_mm ? d.width_mm.toLocaleString()+'mm' : '-'}</td></tr>
                <tr><td>桁長</td><td>${d.length_mm ? d.length_mm.toLocaleString()+'mm' : '-'}</td></tr>
                <tr><td>版厚</td><td>${d.thickness_mm||'-'}mm</td></tr>
                <tr><td>主桁</td><td>${g.count||'-'}本 @${g.spacing_mm||'-'}mm</td></tr>
                <tr><td>底鋼板</td><td>${bp.exists ? 't='+bp.thickness_mm+'mm（'+bp.material+'）' : 'なし'}</td></tr>
              </table>
            </div>
            <div class="info-box">
              <h4>型枠構成</h4>
              <table>
                <tr><td>底型枠</td><td>${fc.bottom_form_required ? '必要' : '<b style="color:#e74c3c">不要</b>（底鋼板あり）'}</td></tr>
                <tr><td>側型枠</td><td>${fc.side_form_required ? '<b style="color:#27ae60">必要</b>' : '不要'}</td></tr>
                <tr><td>ハンチ型枠</td><td>${fc.haunch_form_required ? '<b style="color:#27ae60">必要</b>' : '不要'}</td></tr>
                <tr><td>支保工</td><td>${fc.shoring_required ? '必要' : '<b style="color:#e74c3c">不要</b>（'+esc(fc.shoring_note||'')+'）'}</td></tr>
              </table>
            </div>
            ${(conJoints.length > 0 || expJoints.length > 0) ? `<div class="info-box">
              <h4>目地</h4>
              <table>
                <tr><td>伸縮目地</td><td>${expJoints.length > 0 ? expJoints.length + '箇所' : 'なし'}</td></tr>
                <tr><td>打継目地</td><td>${conJoints.length}箇所</td></tr>
                ${conJoints.map(j => `<tr><td>\u3000${esc(j.position)}</td><td>${esc(j.treatment||'')}</td></tr>`).join('')}
                <tr><td>備考</td><td>${esc(joints.note||'')}</td></tr>
              </table>
            </div>` : ''}
            <div class="full">
              <div id="overviewDiagram" class="diagram-container" style="padding:10px"></div>
            </div>
            <div class="full info-box">
              <h4>面一覧</h4>
              <table class="qty-table">
                <thead><tr><th>面</th><th>名称</th><th>寸法</th><th>パネル数</th><th>セパ数</th></tr></thead>
                <tbody>${faceSummary}</tbody>
              </table>
            </div>
            <div class="full">
              <h4 style="margin-bottom:8px">注意事項</h4>
              ${notesHtml}
            </div>
          </div>
        </div></div>`;

      this.renderOverviewDiagram(data);
    },

    renderOverviewDiagram(data) {
      const s = data.structure;
      const d = s.dimensions || {};
      const g = s.girders || {};

      const svgW = 800, svgH = 400;
      const margin = 60;

      let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" style="font-family:'BIZ UDPGothic',sans-serif">`;

      // Plan view
      const planW = svgW - margin*2, planH = 130;
      const planX = margin, planY = 30;
      const scaleX = planW / d.length_mm;
      const scaleY = planH / d.width_mm;

      svg += `<rect x="${planX}" y="${planY}" width="${planW}" height="${planH}" fill="#e8f4fd" stroke="#1a5276" stroke-width="2"/>`;
      svg += `<text x="${planX + planW/2}" y="${planY - 8}" text-anchor="middle" font-size="13" font-weight="bold" fill="#1a5276">平面図（見下ろし）</text>`;

      if (g.count && g.spacing_mm) {
        for (let i = 0; i < g.count; i++) {
          const gy = planY + (i * g.spacing_mm + (d.width_mm - (g.count-1)*g.spacing_mm)/2) * scaleY;
          svg += `<line x1="${planX}" y1="${gy}" x2="${planX+planW}" y2="${gy}" stroke="#888" stroke-width="1" stroke-dasharray="4,4"/>`;
          if (i === 0 || i === g.count-1 || i === 7) {
            svg += `<text x="${planX - 4}" y="${gy + 4}" text-anchor="end" font-size="9" fill="#888">${g.labels?.[i]||''}</text>`;
          }
        }
      }

      svg += `<text x="${planX + planW/2}" y="${planY - 22}" text-anchor="middle" font-size="11" fill="#e74c3c">← A面（${d.width_mm?.toLocaleString()}mm）→</text>`;
      svg += `<text x="${planX - 8}" y="${planY + planH/2}" text-anchor="end" font-size="11" fill="#2980b9" transform="rotate(-90,${planX-8},${planY+planH/2})">B面（${d.length_mm?.toLocaleString()}mm）</text>`;
      svg += `<text x="${planX + planW + 8}" y="${planY + planH/2}" text-anchor="start" font-size="11" fill="#2980b9" transform="rotate(90,${planX+planW+8},${planY+planH/2})">B'面</text>`;
      svg += dimLine(planX, planY + planH + 15, planX + planW, planY + planH + 15, `${d.length_mm?.toLocaleString()}mm（桁長）`);

      // Cross section
      const secY = 240, secH = 60;
      const secW = planW * 0.6;
      const secX = (svgW - secW) / 2;

      svg += `<text x="${svgW/2}" y="${secY - 12}" text-anchor="middle" font-size="13" font-weight="bold" fill="#1a5276">断面図</text>`;
      svg += `<rect x="${secX}" y="${secY}" width="${secW}" height="${secH*0.3}" fill="#ccc" stroke="#333" stroke-width="1.5"/>`;
      svg += `<text x="${secX + secW/2}" y="${secY + secH*0.15 + 4}" text-anchor="middle" font-size="10" fill="#333">床版 t=${d.thickness_mm}mm</text>`;
      svg += `<rect x="${secX}" y="${secY + secH*0.3}" width="${secW}" height="${secH*0.08}" fill="#8B4513" stroke="#333" stroke-width="1"/>`;
      svg += `<text x="${secX + secW + 4}" y="${secY + secH*0.34 + 3}" font-size="9" fill="#8B4513">底鋼板 t=18mm</text>`;

      if (g.count) {
        const gScaleX = secW / d.width_mm;
        const offset = (d.width_mm - (g.count-1)*g.spacing_mm) / 2;
        for (let i = 0; i < g.count; i++) {
          const gx = secX + (offset + i * g.spacing_mm) * gScaleX;
          const flW = 12, webH = secH*0.4, flH = 3;
          const topY = secY + secH*0.38;
          svg += `<rect x="${gx-flW/2}" y="${topY}" width="${flW}" height="${flH}" fill="#555"/>`;
          svg += `<rect x="${gx-2}" y="${topY+flH}" width="4" height="${webH-flH*2}" fill="#555"/>`;
          svg += `<rect x="${gx-flW/2}" y="${topY+webH-flH}" width="${flW}" height="${flH}" fill="#555"/>`;
        }
      }

      svg += `<text x="${secX + 30}" y="${secY + secH*0.3 - 4}" font-size="9" fill="#e67e22">▲ ハンチ</text>`;
      svg += `<line x1="${secX}" y1="${secY}" x2="${secX}" y2="${secY + secH*0.38 + 8}" stroke="#e74c3c" stroke-width="2"/>`;
      svg += `<text x="${secX - 4}" y="${secY + secH*0.2}" text-anchor="end" font-size="9" fill="#e74c3c">側型枠</text>`;
      svg += `<line x1="${secX+secW}" y1="${secY}" x2="${secX+secW}" y2="${secY + secH*0.38 + 8}" stroke="#e74c3c" stroke-width="2"/>`;
      svg += dimLine(secX, secY + secH + 15, secX + secW, secY + secH + 15, `${d.width_mm?.toLocaleString()}mm（橋幅）`);

      // Legend
      const legX = svgW - 180, legY = secY;
      svg += `<rect x="${legX}" y="${legY}" width="170" height="90" fill="#fff" stroke="#ddd" rx="4"/>`;
      svg += `<text x="${legX+8}" y="${legY+16}" font-size="11" font-weight="bold" fill="#333">凡例</text>`;
      svg += `<line x1="${legX+8}" y1="${legY+28}" x2="${legX+28}" y2="${legY+28}" stroke="#888" stroke-width="1" stroke-dasharray="4,4"/>`;
      svg += `<text x="${legX+34}" y="${legY+32}" font-size="10" fill="#666">主桁</text>`;
      svg += `<rect x="${legX+8}" y="${legY+38}" width="20" height="6" fill="#8B4513"/>`;
      svg += `<text x="${legX+34}" y="${legY+46}" font-size="10" fill="#666">底鋼板</text>`;
      svg += `<line x1="${legX+8}" y1="${legY+58}" x2="${legX+28}" y2="${legY+58}" stroke="#e74c3c" stroke-width="2"/>`;
      svg += `<text x="${legX+34}" y="${legY+62}" font-size="10" fill="#666">側型枠位置</text>`;
      svg += `<rect x="${legX+8}" y="${legY+68}" width="20" height="10" fill="#ccc" stroke="#333" stroke-width="0.5"/>`;
      svg += `<text x="${legX+34}" y="${legY+78}" font-size="10" fill="#666">床版コンクリート</text>`;

      svg += '</svg>';
      document.getElementById('overviewDiagram').innerHTML = svg;
    },

    // ============================================================
    // Face Views
    // ============================================================
    buildFaceViews(data) {
      if (!data.phases) return;
      data.phases.forEach(phase => {
        (phase.faces||[]).forEach(face => {
          let viewEl = document.getElementById('view-face-' + face.id);
          if (!viewEl) {
            viewEl = document.createElement('div');
            viewEl.id = 'view-face-' + face.id;
            viewEl.style.display = 'none';
            document.getElementById('mainArea').appendChild(viewEl);
          }
          if (face.face_type === 'haunch') {
            this.buildHaunchView(viewEl, face, data);
          } else {
            this.buildSideFaceView(viewEl, face);
          }
        });
      });
    },

    buildSideFaceView(el, face) {
      const sep = face.separators || {};
      el.innerHTML = `
        <div class="card">
          <div class="card-header">
            ${esc(face.id)}面 割付図 — ${esc(face.name||'')}
            <span style="font-size:12px;color:#666;font-weight:normal">${face.width_mm?.toLocaleString()}mm × ${face.height_mm}mm ｜ ${esc(face.finish||'')}</span>
          </div>
          <div class="card-body">
            <div class="diagram-controls">
              <label>色分け:</label>
              <select onchange="redrawCurrent()" id="colorMode-${face.id}">
                <option value="type">定尺/カット</option>
                <option value="orientation">縦使い/横使い</option>
              </select>
              <span style="font-size:11px;color:#999">※高さ方向拡大表示（実際のアスペクト比とは異なります）</span>
            </div>
            <div class="diagram-container" id="diagram-${face.id}"></div>
            <div style="margin-top:12px" class="overview-grid">
              <div class="info-box">
                <h4>割付情報</h4>
                <table>
                  <tr><td>面寸法</td><td>${face.width_mm?.toLocaleString()} × ${face.height_mm}mm</td></tr>
                  <tr><td>パネル枚数</td><td>${face.panels?.length||0}枚</td></tr>
                  <tr><td>使い方</td><td>${face.panels?.[0]?.orientation==='横' ? '横使い（1800mm水平）' : '縦使い（1800mm垂直）'}</td></tr>
                  <tr><td>割付方式</td><td>${esc(face.layout_method||'片追い')}</td></tr>
                  <tr><td>仕上げ</td><td>${esc(face.finish||'')}</td></tr>
                </table>
              </div>
              <div class="info-box">
                <h4>セパレーター仕様</h4>
                <table>
                  <tr><td>種類</td><td>${esc(sep.type||'-')} ${esc(sep.diameter||'')}</td></tr>
                  <tr><td>水平ピッチ</td><td>@${sep.pitch_h_mm||'-'}mm</td></tr>
                  <tr><td>段数</td><td>${sep.rows||1}段</td></tr>
                  <tr><td>端あき</td><td>${sep.edge_margin_mm||'-'}mm</td></tr>
                  <tr><td>セパ長</td><td>${sep.length_mm||'-'}mm</td></tr>
                  <tr><td>本数</td><td>${sep.count||'-'}本</td></tr>
                </table>
              </div>
            </div>
          </div>
        </div>`;
      this.renderFaceDiagram(face.id, face);
    },

    renderFaceDiagram(faceId, face) {
      const container = document.getElementById('diagram-' + faceId);
      if (!container) return;

      const showPanels = document.getElementById('showPanels')?.checked ?? true;
      const showSep = document.getElementById('showSeparators')?.checked ?? true;
      const showDim = document.getElementById('showDimensions')?.checked ?? true;

      const panels = face.panels || [];
      const sep = face.separators || {};
      const faceW = face.width_mm;
      const faceH = face.height_mm;

      const svgW = Math.min(1200, Math.max(800, container.clientWidth - 20));
      const marginL = 70, marginR = 50, marginT = 40, marginB = 90;
      const drawW = svgW - marginL - marginR;
      const scaleX = drawW / faceW;
      const minDrawH = 150;
      const drawH = Math.max(minDrawH, faceH * scaleX);
      const scaleY = drawH / faceH;
      const svgH = drawH + marginT + marginB;

      let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" style="font-family:'BIZ UDPGothic',sans-serif">`;
      svg += `<rect x="${marginL}" y="${marginT}" width="${drawW}" height="${drawH}" fill="#f9f9f9" stroke="#333" stroke-width="1.5"/>`;

      // Panels
      if (showPanels && panels.length > 0) {
        let xOff = 0;
        panels.forEach(p => {
          const pw = p.width_mm * scaleX;
          const px = marginL + xOff;
          const py = marginT;
          let fill = p.type === 'カット' ? '#FFF3B0' : '#ffffff';
          svg += `<rect x="${px}" y="${py}" width="${pw}" height="${drawH}" fill="${fill}" stroke="#666" stroke-width="0.8"/>`;
          const fontSize = Math.min(11, pw * 0.12);
          if (fontSize >= 6) {
            svg += `<text x="${px + pw/2}" y="${py + drawH*0.35}" text-anchor="middle" font-size="${fontSize}" fill="#333" font-weight="bold">${esc(p.id)}</text>`;
            const arrowY = py + drawH * 0.55;
            svg += `<text x="${px + pw/2}" y="${arrowY}" text-anchor="middle" font-size="${Math.max(8,fontSize-1)}" fill="#888">${p.orientation==='横'?'→横':'↑縦'}</text>`;
            if (p.type === 'カット' && p.width_mm !== 1800) {
              svg += `<text x="${px + pw/2}" y="${arrowY + fontSize + 2}" text-anchor="middle" font-size="${Math.max(7,fontSize-2)}" fill="#c0392b">${p.width_mm}×${p.height_mm}</text>`;
            }
          }
          xOff += pw;
        });
      }

      // Separators
      if (showSep && sep.count && sep.pitch_h_mm) {
        const edgeM = (sep.edge_margin_mm || 150) * scaleX;
        const pitchH = sep.pitch_h_mm * scaleX;
        const rows = sep.rows || 1;
        const vPositions = [];
        if (rows === 1) {
          vPositions.push(marginT + drawH / 2);
        } else {
          const edgeMV = (sep.edge_margin_mm || 150) * scaleY;
          const pitchV = (sep.pitch_v_mm || sep.pitch_h_mm) * scaleY;
          for (let r = 0; r < rows; r++) vPositions.push(marginT + edgeMV + r * pitchV);
        }
        let x = marginL + edgeM;
        while (x <= marginL + drawW - edgeM + 1) {
          vPositions.forEach(y => {
            const fillColor = sep.type === 'B型' ? '#333' : 'none';
            svg += `<circle cx="${x}" cy="${y}" r="5" fill="${fillColor}" stroke="#333" stroke-width="1.2"/>`;
          });
          x += pitchH;
        }
        svg += `<text x="${marginL + drawW + 4}" y="${vPositions[0] + 4}" font-size="9" fill="#666">${sep.type === 'B型' ? '● B型' : '○ C型'} ${esc(sep.diameter||'')}</text>`;
      }

      // Dimension lines
      if (showDim) {
        const dimY1 = marginT + drawH + 18;
        svg += dimLine(marginL, dimY1, marginL + drawW, dimY1, `${faceW.toLocaleString()}mm`);
        svg += dimLineV(marginL - 15, marginT, marginL - 15, marginT + drawH, `${faceH}mm`);

        if (panels.length > 0) {
          const p0w = panels[0].width_mm * scaleX;
          svg += dimLine(marginL, marginT - 10, marginL + p0w, marginT - 10, `${panels[0].width_mm}`);
          const lastP = panels[panels.length - 1];
          if (lastP.width_mm !== panels[0].width_mm) {
            const lastPw = lastP.width_mm * scaleX;
            svg += dimLine(marginL + drawW - lastPw, marginT - 10, marginL + drawW, marginT - 10, `${lastP.width_mm}`);
          }
        }

        if (sep.pitch_h_mm) {
          const dimY2 = dimY1 + 22;
          const edgeM = (sep.edge_margin_mm || 150) * scaleX;
          const pitchH = sep.pitch_h_mm * scaleX;
          const edgeVal = sep.edge_margin_mm || 150;
          if (edgeM > 30) {
            svg += dimLine(marginL, dimY2, marginL + edgeM, dimY2, `${edgeVal}`);
          } else {
            svg += `<line x1="${marginL}" y1="${dimY2}" x2="${marginL + edgeM}" y2="${dimY2}" stroke="#333" stroke-width="0.6"/>`;
            svg += `<line x1="${marginL}" y1="${dimY2-3}" x2="${marginL}" y2="${dimY2+3}" stroke="#333" stroke-width="0.6"/>`;
            svg += `<line x1="${marginL + edgeM}" y1="${dimY2-3}" x2="${marginL + edgeM}" y2="${dimY2+3}" stroke="#333" stroke-width="0.6"/>`;
            svg += `<line x1="${marginL + edgeM/2}" y1="${dimY2}" x2="${marginL + edgeM/2 - 15}" y2="${dimY2 + 14}" stroke="#333" stroke-width="0.4"/>`;
            svg += `<text x="${marginL + edgeM/2 - 16}" y="${dimY2 + 24}" text-anchor="end" font-size="9" fill="#333">端あき ${edgeVal}mm</text>`;
          }
          svg += dimLine(marginL + edgeM, dimY2, marginL + edgeM + pitchH, dimY2, `@${sep.pitch_h_mm}`);
          svg += `<text x="${marginL + edgeM + pitchH + 6}" y="${dimY2 + 3}" font-size="9" fill="#666">（セパピッチ）</text>`;
        }
      }

      // Joint lines
      const joints = appData?.structure?.joints;
      if (joints && showDim) {
        // Expansion joints - red double lines (vertical)
        const expJoints = joints.expansion_joints || [];
        expJoints.forEach(j => {
          if (j.position_mm === undefined) return;
          const jx = marginL + j.position_mm * scaleX;
          svg += `<line x1="${jx-1}" y1="${marginT-5}" x2="${jx-1}" y2="${marginT+drawH+5}" stroke="#FF0000" stroke-width="2"/>`;
          svg += `<line x1="${jx+1}" y1="${marginT-5}" x2="${jx+1}" y2="${marginT+drawH+5}" stroke="#FF0000" stroke-width="2"/>`;
          svg += `<text x="${jx}" y="${marginT-8}" text-anchor="middle" font-size="8" fill="#FF0000">伸縮目地</text>`;
        });
        // Construction joints - blue dashed lines
        const conJoints = joints.construction_joints || [];
        conJoints.forEach(j => {
          if (j.direction === 'horizontal') {
            svg += `<line x1="${marginL}" y1="${marginT+drawH}" x2="${marginL+drawW}" y2="${marginT+drawH}" stroke="#0000FF" stroke-width="1.5" stroke-dasharray="6,3"/>`;
            svg += `<text x="${marginL+drawW+5}" y="${marginT+drawH+3}" font-size="7" fill="#0000FF">打継目地</text>`;
          } else if (j.direction === 'vertical' && j.position_mm !== undefined) {
            const jx = marginL + j.position_mm * scaleX;
            svg += `<line x1="${jx}" y1="${marginT-5}" x2="${jx}" y2="${marginT+drawH+5}" stroke="#0000FF" stroke-width="1.5" stroke-dasharray="6,3"/>`;
            svg += `<text x="${jx}" y="${marginT-8}" text-anchor="middle" font-size="7" fill="#0000FF">打継目地</text>`;
          }
        });
      }

      svg += '</svg>';
      container.innerHTML = svg;
    },

    buildHaunchView(el, face, data) {
      el.innerHTML = `
        <div class="card">
          <div class="card-header">${esc(face.id)}面 — ${esc(face.name||'')}</div>
          <div class="card-body">
            <div class="info-box">
              <h4>ハンチ部仕様</h4>
              <table>
                <tr><td>ハンチ深さ</td><td>${face.haunch_depth_mm||'-'}mm</td></tr>
                <tr><td>ハンチ幅</td><td>${face.haunch_width_mm||'-'}mm</td></tr>
                <tr><td>主桁本数</td><td>${face.girder_count||'-'}本</td></tr>
                <tr><td>主桁あたり枚数</td><td>${face.panels_per_girder||'-'}枚（左右各1枚）</td></tr>
                <tr><td>合計パネル数</td><td>${face.total_panels||'-'}枚</td></tr>
              </table>
              <div style="margin-top:12px">${esc(face.panel_note||'')}</div>
            </div>
            <div class="diagram-container" style="padding:20px">
              ${this.renderHaunchDiagram(face, data)}
            </div>
          </div>
        </div>`;
    },

    renderHaunchDiagram(face, data) {
      const svgW = 600, svgH = 250;
      let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" style="font-family:'BIZ UDPGothic',sans-serif">`;
      svg += `<text x="${svgW/2}" y="20" text-anchor="middle" font-size="13" font-weight="bold" fill="#1a5276">ハンチ部断面詳細</text>`;

      const deckY = 50, deckH = 40, deckW = 400;
      const deckX = (svgW - deckW) / 2;
      svg += `<rect x="${deckX}" y="${deckY}" width="${deckW}" height="${deckH}" fill="#ddd" stroke="#333" stroke-width="1.5"/>`;
      svg += `<text x="${svgW/2}" y="${deckY + deckH/2 + 4}" text-anchor="middle" font-size="11" fill="#333">床版 t=${data?.structure?.dimensions?.thickness_mm||178}mm</text>`;
      svg += `<rect x="${deckX}" y="${deckY + deckH}" width="${deckW}" height="4" fill="#8B4513" stroke="#333"/>`;

      const gx = svgW / 2;
      const flangeW = 60, webH = 80, flangeH = 8;
      const girderTop = deckY + deckH + 4;
      svg += `<rect x="${gx-flangeW/2}" y="${girderTop}" width="${flangeW}" height="${flangeH}" fill="#666"/>`;
      svg += `<rect x="${gx-6}" y="${girderTop+flangeH}" width="12" height="${webH}" fill="#666"/>`;
      svg += `<rect x="${gx-flangeW/2}" y="${girderTop+flangeH+webH}" width="${flangeW}" height="${flangeH}" fill="#666"/>`;
      svg += `<text x="${gx}" y="${girderTop+flangeH+webH/2+4}" text-anchor="middle" font-size="10" fill="#fff">主桁</text>`;

      const hW = 60, hD = 25;
      svg += `<polygon points="${gx-flangeW/2-hW},${deckY+deckH} ${gx-flangeW/2},${deckY+deckH} ${gx-flangeW/2},${deckY+deckH+hD}" fill="#f39c12" stroke="#e67e22" stroke-width="1.5"/>`;
      svg += `<text x="${gx-flangeW/2-hW/2}" y="${deckY+deckH+hD/2+4}" text-anchor="middle" font-size="9" fill="#c0392b">ハンチ</text>`;
      svg += `<polygon points="${gx+flangeW/2+hW},${deckY+deckH} ${gx+flangeW/2},${deckY+deckH} ${gx+flangeW/2},${deckY+deckH+hD}" fill="#f39c12" stroke="#e67e22" stroke-width="1.5"/>`;
      svg += `<text x="${gx+flangeW/2+hW/2}" y="${deckY+deckH+hD/2+4}" text-anchor="middle" font-size="9" fill="#c0392b">ハンチ</text>`;

      const dimYh = deckY + deckH + hD + 30;
      svg += dimLine(gx - flangeW/2 - hW, dimYh, gx - flangeW/2, dimYh, `${face.haunch_width_mm||200}mm`);
      svg += dimLineV(gx + flangeW/2 + hW + 20, deckY + deckH, gx + flangeW/2 + hW + 20, deckY + deckH + hD, `${face.haunch_depth_mm||50}mm`);
      svg += `<text x="${svgW/2}" y="${svgH - 15}" text-anchor="middle" font-size="10" fill="#666">主桁1本につき左右2枚の三角カット合板 × ${face.girder_count||16}本 = ${face.total_panels||32}枚</text>`;

      svg += '</svg>';
      return svg;
    },

    // ============================================================
    // PDF Export
    // ============================================================
    exportPDF(data) {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
      const pw = 420, ph = 297, m = 15;
      const s = data.structure;
      const d = s.dimensions || {};
      const p = data.project || {};

      const faces = [];
      (data.phases||[]).forEach(ph2 => (ph2.faces||[]).forEach(f => {
        if (f.face_type !== 'haunch') faces.push(f);
      }));
      const totalPages = 1 + faces.length + 1;
      const bodyTop = m + 18;

      // Page 1: Overview
      pdfDrawHeaderFooter(doc, 'Overview', 1, totalPages);
      doc.setTextColor(0);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Structure Info', m + 4, bodyTop + 8);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      [`Type: ${s.subtype||s.type||''}`, `Width: ${d.width_mm?.toLocaleString()||'-'}mm`,
       `Length: ${d.length_mm?.toLocaleString()||'-'}mm`, `Thickness: ${d.thickness_mm||'-'}mm`,
       `Girders: ${s.girders?.count||'-'} @ ${s.girders?.spacing_mm||'-'}mm`,
       `Base Plate: t=${s.base_plate?.thickness_mm||'-'}mm (${s.base_plate?.material||''})`
      ].forEach((line, i) => doc.text(line, m + 6, bodyTop + 16 + i * 5));

      const planX2 = m + 100, planY2 = bodyTop + 10, planW2 = 200, planH2 = 80;
      doc.setDrawColor(26, 82, 118);
      doc.setLineWidth(0.5);
      doc.rect(planX2, planY2, planW2, planH2);
      doc.setFontSize(7);
      doc.setTextColor(100);
      doc.text('Plan View', planX2 + planW2/2, planY2 - 2, { align: 'center' });
      doc.setTextColor(0);
      doc.setFontSize(8);
      doc.text(`${d.length_mm?.toLocaleString()}mm`, planX2 + planW2/2, planY2 + planH2 + 8, { align: 'center' });

      doc.setTextColor(0);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('Notes:', m + 4, bodyTop + 60);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      (data.notes||[]).forEach((n, i) => doc.text(`[${n.category}] ${n.content}`, m + 6, bodyTop + 68 + i * 5));

      // Face pages
      faces.forEach((face, fi) => {
        doc.addPage('a3', 'landscape');
        pdfDrawHeaderFooter(doc, `${face.id} - ${face.name||''}`, fi + 2, totalPages);
        doc.setTextColor(0);

        const panels = face.panels || [];
        const sep = face.separators || {};
        const drawAreaW = pw * 0.62;
        const bodyH = ph - m*2 - 24;
        const sX2 = drawAreaW / face.width_mm;
        const faceDrawW = face.width_mm * sX2;
        const faceDrawH = Math.max(bodyH * 0.4, face.height_mm * sX2);
        const faceDrawX = m + 4 + (drawAreaW - faceDrawW) / 2;
        const faceDrawY = bodyTop + 24;

        doc.setDrawColor(50);
        doc.setLineWidth(0.4);
        doc.rect(faceDrawX, faceDrawY, faceDrawW, faceDrawH);

        let xOff2 = 0;
        panels.forEach(pan => {
          const panW = pan.width_mm * sX2;
          const panX = faceDrawX + xOff2;
          if (pan.type === 'カット') doc.setFillColor(255, 243, 176);
          else doc.setFillColor(255, 255, 255);
          doc.rect(panX, faceDrawY, panW, faceDrawH, 'FD');
          if (panW > 8) {
            doc.setFontSize(Math.min(7, panW * 0.4));
            doc.setTextColor(50);
            doc.text(pan.id, panX + panW/2, faceDrawY + faceDrawH/2, { align: 'center' });
          }
          xOff2 += panW;
        });

        if (sep.count && sep.pitch_h_mm) {
          const edgeM = (sep.edge_margin_mm || 150) * sX2;
          const pitchH = sep.pitch_h_mm * sX2;
          const vPos = [faceDrawY + faceDrawH / 2];
          doc.setDrawColor(50);
          doc.setLineWidth(0.3);
          let sx2 = faceDrawX + edgeM;
          while (sx2 <= faceDrawX + faceDrawW - edgeM + 0.1) {
            vPos.forEach(sy => {
              if (sep.type === 'B型') doc.circle(sx2, sy, 1, 'F');
              else doc.circle(sx2, sy, 1, 'S');
            });
            sx2 += pitchH;
          }
        }

        doc.setFontSize(7);
        doc.setTextColor(0);
        doc.setDrawColor(0);
        doc.setLineWidth(0.2);
        doc.line(faceDrawX, faceDrawY + faceDrawH + 8, faceDrawX + faceDrawW, faceDrawY + faceDrawH + 8);
        doc.text(`${face.width_mm.toLocaleString()}mm`, faceDrawX + faceDrawW/2, faceDrawY + faceDrawH + 13, { align: 'center' });
        doc.text(`${face.height_mm}mm`, faceDrawX - 3, faceDrawY + faceDrawH/2, { align: 'right' });

        const infoX = pw * 0.66, infoY = bodyTop + 4;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('Face Info', infoX, infoY + 6);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        [`Face: ${face.id} - ${face.name||''}`, `Size: ${face.width_mm?.toLocaleString()} x ${face.height_mm}mm`,
         `Panels: ${panels.length}`, `Layout: ${face.layout_method||''}`, `Finish: ${face.finish||''}`, '',
         'Separator:', `  Type: ${sep.type||'-'} ${sep.diameter||''}`, `  Pitch: @${sep.pitch_h_mm||'-'}mm`,
         `  Rows: ${sep.rows||1}`, `  Edge: ${sep.edge_margin_mm||'-'}mm`, `  Count: ${sep.count||'-'}`
        ].forEach((line, i) => doc.text(line, infoX + 2, infoY + 14 + i * 5));
      });

      // Quantities page
      doc.addPage('a3', 'landscape');
      pdfDrawHeaderFooter(doc, 'Quantity Summary', totalPages, totalPages);
      doc.setTextColor(0);
      const q = data.quantities || {};
      let ty = bodyTop + 4;

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('Panel Quantity', m + 4, ty + 6);
      ty += 10;
      const pHeaders = ['No', 'Face', 'Size (mm)', 'Type', 'Count', 'Area m2'];
      const pColW = [12, 30, 40, 25, 20, 25];
      let tx = m + 4;
      doc.setFillColor(240, 244, 248);
      doc.rect(tx, ty, pColW.reduce((a,b)=>a+b,0), 6, 'F');
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      pHeaders.forEach((h, i) => { doc.text(h, tx + 2, ty + 4); tx += pColW[i]; });
      ty += 6;
      doc.setFont('helvetica', 'normal');
      (q.panels?.summary||[]).forEach((r, i) => {
        tx = m + 4;
        doc.text(String(i+1), tx+2, ty+4); tx+=pColW[0];
        doc.text(r.face||'', tx+2, ty+4); tx+=pColW[1];
        doc.text(r.size||'', tx+2, ty+4); tx+=pColW[2];
        doc.text(r.type||'', tx+2, ty+4); tx+=pColW[3];
        doc.text(String(r.count), tx+2, ty+4); tx+=pColW[4];
        doc.text(r.area_m2!==null?r.area_m2.toFixed(2):'-', tx+2, ty+4);
        ty += 5;
      });
      doc.setFont('helvetica', 'bold');
      doc.setFillColor(232, 240, 254);
      tx = m + 4;
      doc.rect(tx, ty, pColW.reduce((a,b)=>a+b,0), 6, 'F');
      doc.text('Total', tx+2, ty+4);
      tx += pColW[0]+pColW[1]+pColW[2]+pColW[3];
      doc.text(String(q.panels?.total_count||0), tx+2, ty+4); tx+=pColW[4];
      doc.text(q.panels?.total_area_m2?.toFixed(2)||'-', tx+2, ty+4);

      const filename = `${p.name||'formwork'}_${p.created_at||'draft'}.pdf`;
      doc.save(filename);
    }
  };

  // Register
  registerModule('deck_slab', SlabModule);
})();
