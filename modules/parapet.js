// ============================================================
// 型知 KATACHI — 地覆・壁高欄モジュール (parapet.js)
// ============================================================

(function() {
  const ParapetModule = {
    type: 'parapet_curb_and_barrier',
    label: '地覆・壁高欄',

    init(data) {
      enableNav();
      buildFaceNav(data);
      this.addInterferenceNav();
      this.buildOverview(data);
      this.buildFaceViews(data);
      this.buildInterferenceView(data);
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
    // Add interference check nav button
    // ============================================================
    addInterferenceNav() {
      const faceNav = document.getElementById('faceNavButtons');
      const btn = document.createElement('button');
      btn.className = 'nav-btn';
      btn.dataset.view = 'interference';
      btn.onclick = () => switchView('interference');
      btn.innerHTML = 'AB-セパ干渉チェック <span class="badge" style="background:#e74c3c">重要</span>';
      faceNav.appendChild(btn);
    },

    // ============================================================
    // Overview
    // ============================================================
    buildOverview(data) {
      const s = data.structure;
      const curb = s.components?.curb || {};
      const barrier = s.components?.barrier || {};
      const ab = s.anchor_bolts || {};
      const cj = s.construction_joint || {};
      const joints = s.joints || {};
      const expansionJoints = joints.expansion_joints || [];
      const ej0 = expansionJoints[0] || {};

      let faceSummary = '';
      if (data.phases) {
        data.phases.forEach(ph => {
          (ph.faces||[]).forEach(f => {
            const w = f.width_mm ? (f.width_mm/1000).toFixed(1)+'m' : '-';
            const h = f.height_mm ? f.height_mm+'mm' : '-';
            const pc = f.panels ? f.panels.length : '-';
            const sc = f.separators ? f.separators.count || '-' : '-';
            faceSummary += `<tr><td>${esc(f.id)}</td><td>${esc(f.name||'')}</td><td>${w} × ${h}</td><td class="num">${pc}</td><td class="num">${sc}</td></tr>`;
          });
        });
      }

      const noteHtml = (data.notes||[]).map(n =>
        `<div class="note-card"><div class="note-cat">${esc(n.category)}</div><div class="note-text">${esc(n.content)}</div></div>`
      ).join('');

      const el = document.getElementById('view-overview');
      el.innerHTML = `
        <div class="card">
          <div class="card-header">全体確認図 — ${esc(s.name||'')}</div>
          <div class="card-body">
            <div class="overview-grid">
              <div class="info-box">
                <h4>地覆</h4>
                <table>
                  <tr><td>断面形状</td><td>${esc(curb.profile||'L字型')}</td></tr>
                  <tr><td>幅（立上り）</td><td>${curb.width_mm||'-'}mm</td></tr>
                  <tr><td>高さ（立上り）</td><td>${curb.height_mm||'-'}mm</td></tr>
                  <tr><td>底版幅</td><td>${curb.base_width_mm||'-'}mm</td></tr>
                  <tr><td>底版厚</td><td>${curb.base_thickness_mm||'-'}mm</td></tr>
                  <tr><td>延長</td><td>${curb.length_mm ? (curb.length_mm/1000).toFixed(1)+'m' : '-'}</td></tr>
                  <tr><td>水抜き</td><td>VP${curb.drain_pipe?.diameter_mm||'-'} @${curb.drain_pipe?.spacing_mm||'-'}mm</td></tr>
                </table>
              </div>
              <div class="info-box">
                <h4>壁高欄</h4>
                <table>
                  <tr><td>天端幅</td><td>${barrier.width_top_mm||'-'}mm</td></tr>
                  <tr><td>基部幅</td><td>${barrier.width_base_mm||'-'}mm</td></tr>
                  <tr><td>高さ</td><td>${barrier.height_mm||'-'}mm</td></tr>
                  <tr><td>テーパー</td><td>${barrier.taper ? 'あり' : 'なし'}</td></tr>
                  <tr><td>延長</td><td>${barrier.length_mm ? (barrier.length_mm/1000).toFixed(1)+'m' : '-'}</td></tr>
                  <tr><td>伸縮目地</td><td>@${barrier.expansion_joint_pitch_mm||'-'}mm</td></tr>
                </table>
              </div>
              <div class="info-box">
                <h4>アンカーボルト</h4>
                <table>
                  <tr><td>径</td><td>M${ab.diameter_mm||'-'}</td></tr>
                  <tr><td>ピッチ</td><td>@${ab.pitch_mm||'-'}mm</td></tr>
                  <tr><td>埋込み長</td><td>${ab.embedment_mm||'-'}mm</td></tr>
                  <tr><td>本数</td><td>${ab.positions?.length||'-'}本</td></tr>
                  <tr><td>備考</td><td>${esc(ab.note||'')}</td></tr>
                </table>
              </div>
              <div class="info-box">
                <h4>打設フェーズ</h4>
                <table>
                  <tr><td>打設方式</td><td>${s.casting_method==='separate'?'別打ち':'一体打ち'}</td></tr>
                  <tr><td>Phase1</td><td>${esc(data.phases?.[0]?.name||'')}</td></tr>
                  <tr><td>Phase2</td><td>${esc(data.phases?.[1]?.name||'')}</td></tr>
                  <tr><td>打継ぎ処理</td><td>${esc(cj.slab_to_curb?.treatment||'')}</td></tr>
                </table>
              </div>
              ${expansionJoints.length > 0 ? `<div class="info-box">
                <h4>目地</h4>
                <table>
                  <tr><td>伸縮目地間隔</td><td>@${joints.interval_mm || '-'}mm</td></tr>
                  <tr><td>目地数</td><td>${expansionJoints.length}箇所</td></tr>
                  <tr><td>目地材</td><td>${esc(ej0.material || '-')}</td></tr>
                  <tr><td>目地厚</td><td>${ej0.thickness_mm || '-'}mm</td></tr>
                  <tr><td>止水板</td><td>${ej0.waterstop?.exists ? esc(ej0.waterstop.type) : 'なし'}</td></tr>
                  <tr><td>シーリング</td><td>${ej0.sealant?.exists ? esc(ej0.sealant.type) : 'なし'}</td></tr>
                  <tr><td>地覆・壁高欄位置一致</td><td>✓ 同位置</td></tr>
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
                <div class="card"><div class="card-header">断面図</div><div class="card-body"><div class="diagram-container" id="crossSectionDiagram"></div></div></div>
              </div>
              ${noteHtml ? `<div class="full"><div class="info-box"><h4>注意事項</h4>${noteHtml}</div></div>` : ''}
            </div>
          </div>
        </div>`;

      this.renderCrossSection(data);
    },

    // ============================================================
    // Cross Section Diagram
    // ============================================================
    renderCrossSection(data) {
      const s = data.structure;
      const curb = s.components?.curb || {};
      const barrier = s.components?.barrier || {};

      const svgW = 500, svgH = 350;
      const cx = svgW / 2;
      const baseY = svgH - 60; // bed slab top line

      // Scale: ~0.2px per mm
      const sc = 0.18;

      // Slab
      const slabW = 300, slabH = 16;

      // Curb dimensions
      const cW = (curb.width_mm||350)*sc;
      const cH = (curb.height_mm||350)*sc;
      const cBW = (curb.base_width_mm||500)*sc;
      const cBH = (curb.base_thickness_mm||100)*sc;

      // Barrier dimensions
      const bWt = (barrier.width_top_mm||200)*sc;
      const bWb = (barrier.width_base_mm||300)*sc;
      const bH = (barrier.height_mm||1000)*sc;

      // Positions (centered on curb)
      const curbLeft = cx - cBW/2;
      const curbRight = cx + cBW/2;
      const curbBaseTop = baseY - cBH;
      const curbTop = baseY - cBH - cH;

      // Wall on top of curb (centered)
      const wallLeft_b = cx - bWb/2;
      const wallRight_b = cx + bWb/2;
      const wallLeft_t = cx - bWt/2;
      const wallRight_t = cx + bWt/2;
      const wallTop = curbTop - bH;

      let svg = `<svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg" style="font-family:'BIZ UDPGothic','Meiryo',sans-serif">`;

      // Slab (gray)
      svg += `<rect x="${cx-slabW/2}" y="${baseY}" width="${slabW}" height="${slabH}" fill="#ccc" stroke="#666" stroke-width="1"/>`;
      svg += `<text x="${cx}" y="${baseY+slabH+12}" text-anchor="middle" font-size="9" fill="#666">床版上面（打継ぎ面）</text>`;

      // Curb base (blue-tint)
      svg += `<rect x="${curbLeft}" y="${curbBaseTop}" width="${cBW}" height="${cBH}" fill="#d6eaf8" stroke="#1a5276" stroke-width="1.2"/>`;

      // Curb upstand
      const upstandLeft = cx - cW/2;
      const upstandRight = cx + cW/2;
      svg += `<rect x="${upstandLeft}" y="${curbTop}" width="${cW}" height="${cH}" fill="#d6eaf8" stroke="#1a5276" stroke-width="1.2"/>`;

      // Labels for curb
      svg += `<text x="${curbLeft-5}" y="${curbBaseTop+cBH/2+3}" text-anchor="end" font-size="8" fill="#1a5276">底版 ${curb.base_width_mm||500}×${curb.base_thickness_mm||100}</text>`;
      svg += `<text x="${upstandLeft-5}" y="${curbTop+cH/2+3}" text-anchor="end" font-size="8" fill="#1a5276">地覆 ${curb.width_mm||350}×${curb.height_mm||350}</text>`;

      // Face labels
      svg += `<text x="${upstandLeft-2}" y="${curbTop+cH/2-8}" text-anchor="end" font-size="7" fill="#e74c3c">CA面→</text>`;
      svg += `<text x="${upstandRight+2}" y="${curbTop+cH/2-8}" text-anchor="start" font-size="7" fill="#e74c3c">←CB面</text>`;

      // Barrier (green-tint, trapezoid if taper)
      if (barrier.taper) {
        const pts = `${wallLeft_b},${curbTop} ${wallRight_b},${curbTop} ${wallRight_t},${wallTop} ${wallLeft_t},${wallTop}`;
        svg += `<polygon points="${pts}" fill="#d5f5e3" stroke="#1e8449" stroke-width="1.2"/>`;
      } else {
        svg += `<rect x="${wallLeft_b}" y="${wallTop}" width="${bWb}" height="${bH}" fill="#d5f5e3" stroke="#1e8449" stroke-width="1.2"/>`;
      }

      // Labels for barrier
      svg += `<text x="${wallLeft_t-5}" y="${wallTop+bH/2+3}" text-anchor="end" font-size="8" fill="#1e8449">壁高欄 H=${barrier.height_mm||1000}</text>`;
      svg += `<text x="${wallLeft_t-2}" y="${wallTop+bH/2+14}" text-anchor="end" font-size="7" fill="#e74c3c">WA面→</text>`;
      svg += `<text x="${wallRight_t+2}" y="${wallTop+bH/2+14}" text-anchor="start" font-size="7" fill="#e74c3c">←WB面</text>`;

      // AB symbol on top
      const abX = cx;
      svg += `<polygon points="${abX},${wallTop-2} ${abX-5},${wallTop-12} ${abX+5},${wallTop-12}" fill="none" stroke="#e74c3c" stroke-width="1.2"/>`;
      svg += `<text x="${abX}" y="${wallTop-15}" text-anchor="middle" font-size="7" fill="#e74c3c">AB (M${s.anchor_bolts?.diameter_mm||20})</text>`;

      // Top label
      svg += `<text x="${cx}" y="${wallTop+12}" text-anchor="middle" font-size="7" fill="#666">t=${barrier.width_top_mm||200}</text>`;
      svg += `<text x="${cx}" y="${curbTop+12}" text-anchor="middle" font-size="7" fill="#666">t=${barrier.width_base_mm||300}</text>`;

      // Dimension: barrier height
      const dimX = wallRight_b + 25;
      svg += dimLineV(dimX, wallTop, dimX, curbTop, `${barrier.height_mm||1000}`);

      // Dimension: curb height
      svg += dimLineV(dimX, curbTop, dimX, curbBaseTop, `${curb.height_mm||350}`);

      // Dimension: base thickness
      svg += dimLineV(dimX, curbBaseTop, dimX, baseY, `${curb.base_thickness_mm||100}`);

      // CT label
      svg += `<text x="${cx}" y="${curbTop-3}" text-anchor="middle" font-size="7" fill="#e74c3c">CT面(天端)</text>`;

      // Joint note at bottom
      const jointsInfo = s.joints;
      if (jointsInfo?.expansion_joints?.length > 0) {
        svg += `<text x="${cx}" y="${baseY+slabH+28}" text-anchor="middle" font-size="8" fill="#FF0000" font-weight="bold">※ 伸縮目地 @${jointsInfo.interval_mm||'-'}mm — 地覆・壁高欄の目地位置を一致させること</text>`;
      }

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
          (phase.faces||[]).forEach(face => {
            let div = document.getElementById('view-face-' + face.id);
            if (!div) {
              div = document.createElement('div');
              div.id = 'view-face-' + face.id;
              div.style.display = 'none';
              mainArea.appendChild(div);
            }
            if (face.face_type === 'top') {
              this.buildTopFaceView(face, div, data);
            } else {
              this.buildSideFaceView(face, div, data);
            }
          });
        });
      }
    },

    buildTopFaceView(face, container, data) {
      container.innerHTML = `
        <div class="card">
          <div class="card-header">${esc(face.id)}面 — ${esc(face.name||'')}</div>
          <div class="card-body">
            <div class="overview-grid">
              <div class="info-box">
                <h4>天端情報</h4>
                <table>
                  <tr><td>寸法</td><td>${face.width_mm ? (face.width_mm/1000).toFixed(1) : '-'}m × ${face.height_mm||'-'}mm</td></tr>
                  <tr><td>仕上げ</td><td>${esc(face.finish||'')}</td></tr>
                  <tr><td>備考</td><td>${esc(face.note||'')}</td></tr>
                </table>
              </div>
              <div class="info-box">
                <h4>天端型枠の注記</h4>
                <p style="font-size:12px;color:#666">天端はコテ仕上げのため型枠不要。<br>
                ABシース穴の位置精度を確認すること。<br>
                地覆外面のコンパネ端材（500mm）を天端型枠（350mm）に転用可能。</p>
              </div>
            </div>
          </div>
        </div>`;
    },

    buildSideFaceView(face, container, data) {
      const sep = face.separators || {};
      const isBarrier = face.id.startsWith('W');
      const hasAB = isBarrier && data.structure?.anchor_bolts;

      container.innerHTML = `
        <div class="card">
          <div class="card-header">${esc(face.id)}面 — ${esc(face.name||'')}
            ${isBarrier ? '<span class="badge" style="background:#1e8449">壁高欄</span>' : '<span class="badge" style="background:#1a5276">地覆</span>'}
          </div>
          <div class="card-body">
            <div class="diagram-container" id="diagram-${face.id}" style="min-height:250px"></div>
            <div class="overview-grid" style="margin-top:16px">
              <div class="info-box">
                <h4>割付情報</h4>
                <table>
                  <tr><td>面寸法</td><td>${face.width_mm ? (face.width_mm/1000).toFixed(1) : '-'}m × ${face.height_mm||'-'}mm</td></tr>
                  <tr><td>パネル枚数</td><td>${face.panels?.length||'-'}枚</td></tr>
                  <tr><td>使い方</td><td>${esc(face.panel_orientation||'')}使い（${face.panel_width_mm||'-'}×${face.panel_height_mm||'-'}mm）</td></tr>
                  <tr><td>割付方式</td><td>${esc(face.layout_method||'')}</td></tr>
                  <tr><td>仕上げ</td><td>${esc(face.finish||'')}</td></tr>
                </table>
              </div>
              <div class="info-box">
                <h4>セパレーター仕様</h4>
                <table>
                  <tr><td>種類</td><td>${esc(sep.type||'-')} ${esc(sep.diameter||'')}</td></tr>
                  <tr><td>水平ピッチ</td><td>@${sep.pitch_h_mm||'-'}mm</td></tr>
                  <tr><td>段数</td><td>${sep.rows||'-'}段</td></tr>
                  ${sep.rows > 1 ? `<tr><td>段位置</td><td>${(sep.row_positions_mm||[]).join(', ')}mm</td></tr>` : ''}
                  <tr><td>セパ長</td><td>${sep.length_mm||'-'}mm</td></tr>
                  <tr><td>本数</td><td>${sep.count||'-'}本</td></tr>
                  ${sep.p_con_size ? `<tr><td>Pコン</td><td>${esc(sep.p_con_size)}</td></tr>` : ''}
                </table>
              </div>
              ${hasAB ? `<div class="info-box full">
                <h4>アンカーボルト情報</h4>
                <p style="font-size:12px;color:#e74c3c;font-weight:bold">△ AB位置が図中に表示されています。干渉チェック図で詳細確認してください。</p>
              </div>` : ''}
              ${(() => {
                const jts = data.structure?.joints;
                if (!jts || !jts.expansion_joints?.length) return '';
                const expJ = jts.expansion_joints;
                const sectionCount = expJ.length + 1;
                const totalLen = face.width_mm || 20000;
                const positions = expJ.map(j => j.position_mm).sort((a,b) => a - b);
                const sections = [];
                let prev = 0;
                positions.forEach(p => { sections.push(p - prev); prev = p; });
                sections.push(totalLen - prev);
                const netLengths = sections.map(s => s + 'mm').join(', ');
                return `<div class="info-box full">
                  <h4>目地区間情報</h4>
                  <p style="font-size:12px">伸縮目地 @${jts.interval_mm}mmで${sectionCount}区間に分割。各区間の有効長: ${netLengths}</p>
                  <p style="font-size:11px;color:#FF0000;font-weight:bold">※ パネルは目地位置で切断しない。目地の両側でパネルを分割する。</p>
                </div>`;
              })()}
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
      if (panels.length === 0) { el.innerHTML = '<p style="color:#999;text-align:center;padding:40px">パネルデータなし</p>'; return; }

      const faceW = face.width_mm || 20000;
      const faceH = face.height_mm || 400;
      const sep = face.separators || {};
      const isBarrier = faceId.startsWith('W');

      // Drawing area
      const marginL = 60, marginR = 30, marginT = isBarrier ? 30 : 20, marginB = 80;
      const drawH = Math.max(150, Math.min(300, faceH * 0.3));
      const drawW = Math.max(600, Math.min(1200, panels.length * 60));
      const svgW = drawW + marginL + marginR;
      const svgH = drawH + marginT + marginB;
      const scaleX = drawW / faceW;
      const scaleY = drawH / faceH;

      let svg = `<svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg" style="font-family:'BIZ UDPGothic','Meiryo',sans-serif">`;

      // AB positions (if barrier face)
      const abPositions = [];
      if (isBarrier && appData?.structure?.anchor_bolts?.positions) {
        appData.structure.anchor_bolts.positions.forEach(ab => {
          abPositions.push(ab.x_mm);
        });
      }

      // Draw AB triangles at top
      if (showDimensions && abPositions.length > 0) {
        abPositions.forEach(abX => {
          const px = marginL + abX * scaleX;
          const ty = marginT - 3;
          svg += `<polygon points="${px},${ty} ${px-5},${ty-10} ${px+5},${ty-10}" fill="none" stroke="#e74c3c" stroke-width="1.2"/>`;
          svg += `<line x1="${px}" y1="${ty}" x2="${px}" y2="${marginT + drawH}" stroke="#e74c3c" stroke-width="0.4" stroke-dasharray="3,3" opacity="0.5"/>`;
        });
      }

      // Panels
      let xOff = 0;
      if (showPanels) {
        panels.forEach(p => {
          const pw = p.width_mm * scaleX;
          const ph = drawH;
          const px = marginL + xOff * scaleX;
          const py = marginT;
          const isCut = p.type === 'カット';
          svg += `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="${isCut ? '#FFF3B0' : '#fff'}" stroke="#888" stroke-width="0.8"/>`;

          // Panel label
          if (pw > 25) {
            svg += `<text x="${px+pw/2}" y="${py+14}" text-anchor="middle" font-size="${pw > 40 ? 9 : 7}" fill="#333">${esc(p.id)}</text>`;
            if (pw > 50) {
              svg += `<text x="${px+pw/2}" y="${py+26}" text-anchor="middle" font-size="7" fill="#888">${p.orientation==='縦'?'↑縦':'→横'}</text>`;
            }
          }
          xOff += p.width_mm;
        });
      }

      // Separators
      if (showSeparators && sep.type) {
        const pitchH = sep.pitch_h_mm || 600;
        const edgeM = sep.edge_margin_mm || 150;
        const rowPositions = sep.row_positions_mm || [faceH/2];
        const isBType = sep.type === 'B型';
        const symR = 4;

        for (let x = edgeM; x <= faceW - edgeM + 1; x += pitchH) {
          const sx = marginL + x * scaleX;
          rowPositions.forEach(ry => {
            const sy = marginT + (faceH - ry) * scaleY;
            if (isBType) {
              svg += `<circle cx="${sx}" cy="${sy}" r="${symR}" fill="#1a5276" stroke="#1a5276" stroke-width="0.8"/>`;
            } else {
              svg += `<circle cx="${sx}" cy="${sy}" r="${symR}" fill="none" stroke="#1a5276" stroke-width="1.2"/>`;
            }
          });
        }
      }

      // Joint lines
      const joints = appData?.structure?.joints;
      if (joints && showDimensions) {
        const expJoints = joints.expansion_joints || [];
        expJoints.forEach(j => {
          const jx = marginL + j.position_mm * scaleX;
          // Red double line for expansion joints
          svg += `<line x1="${jx-1}" y1="${marginT-5}" x2="${jx-1}" y2="${marginT+drawH+5}" stroke="#FF0000" stroke-width="2"/>`;
          svg += `<line x1="${jx+1}" y1="${marginT-5}" x2="${jx+1}" y2="${marginT+drawH+5}" stroke="#FF0000" stroke-width="2"/>`;
          // Label
          svg += `<text x="${jx}" y="${marginT-8}" text-anchor="middle" font-size="8" fill="#FF0000">目地 t=${j.thickness_mm||20}</text>`;
          // Waterstop symbol (small rectangle at center)
          if (j.waterstop?.exists) {
            const wy = marginT + drawH/2;
            svg += `<rect x="${jx-6}" y="${wy-4}" width="12" height="8" fill="none" stroke="#0000FF" stroke-width="0.8"/>`;
            svg += `<text x="${jx}" y="${wy+2}" text-anchor="middle" font-size="5" fill="#0000FF">止水</text>`;
          }
        });

        // Construction joints (blue dashed)
        const conJoints = joints.construction_joints || [];
        conJoints.forEach(j => {
          if (j.direction === 'horizontal') {
            // Horizontal dashed blue line across the face
            svg += `<line x1="${marginL}" y1="${marginT+drawH}" x2="${marginL+drawW}" y2="${marginT+drawH}" stroke="#0000FF" stroke-width="1.5" stroke-dasharray="6,3"/>`;
            svg += `<text x="${marginL+drawW+5}" y="${marginT+drawH+3}" font-size="7" fill="#0000FF">打継目地</text>`;
          }
        });
      }

      // Dimensions
      if (showDimensions) {
        const dimY1 = marginT + drawH + 16;
        const dimY2 = dimY1 + 22;

        // Total width
        svg += dimLine(marginL, dimY1, marginL + drawW, dimY1, `${faceW.toLocaleString()}mm`);

        // Panel widths (if not too many)
        if (panels.length <= 15) {
          let dx = 0;
          panels.forEach(p => {
            const px1 = marginL + dx * scaleX;
            const px2 = marginL + (dx + p.width_mm) * scaleX;
            if (px2 - px1 > 20) {
              svg += dimLine(px1, dimY2, px2, dimY2, `${p.width_mm}`);
            }
            dx += p.width_mm;
          });
        }

        // Separator pitch
        if (sep.pitch_h_mm) {
          const dimY3 = dimY2 + 18;
          const edgeM = sep.edge_margin_mm || 150;
          // Edge + pitch label
          const ex1 = marginL;
          const ex2 = marginL + edgeM * scaleX;
          if (ex2 - ex1 > 12) {
            svg += `<text x="${(ex1+ex2)/2}" y="${dimY3}" text-anchor="middle" font-size="8" fill="#666">あき ${edgeM}mm</text>`;
          }
          svg += `<text x="${marginL + drawW/2}" y="${dimY3}" text-anchor="middle" font-size="9" fill="#1a5276">@${sep.pitch_h_mm}（セパピッチ）</text>`;
        }

        // Height dimension (vertical)
        svg += dimLineV(marginL - 10, marginT, marginL - 10, marginT + drawH, `${faceH}mm`);

        // Sepa row labels
        if (sep.row_positions_mm && sep.rows > 1) {
          sep.row_positions_mm.forEach((ry, i) => {
            const sy = marginT + (faceH - ry) * scaleY;
            svg += `<text x="${marginL + drawW + 8}" y="${sy + 3}" font-size="7" fill="#1a5276">${i+1}段 ${ry}mm</text>`;
          });
        }
      }

      svg += `</svg>`;
      el.innerHTML = svg;
    },

    // ============================================================
    // Interference Check View
    // ============================================================
    buildInterferenceView(data) {
      const mainArea = document.getElementById('mainArea');
      let div = document.getElementById('view-interference');
      if (!div) {
        div = document.createElement('div');
        div.id = 'view-interference';
        div.style.display = 'none';
        mainArea.appendChild(div);
      }

      const ab = data.structure?.anchor_bolts;
      if (!ab || !ab.positions) {
        div.innerHTML = '<div class="card"><div class="card-header">AB-セパ干渉チェック</div><div class="card-body"><p>アンカーボルトデータがありません</p></div></div>';
        return;
      }

      // Find wall face for sepa info
      let wallFace = null;
      (data.phases||[]).forEach(ph => {
        (ph.faces||[]).forEach(f => {
          if (f.id === 'WA') wallFace = f;
        });
      });

      const sep = wallFace?.separators || {};
      const pitchH = sep.pitch_h_mm || 450;
      const edgeM = sep.edge_margin_mm || 150;
      const faceW = wallFace?.width_mm || 20000;
      const faceH = wallFace?.height_mm || 1050;
      const minClearance = wallFace?.interference_check?.min_clearance_mm || 50;

      // Generate separator X positions
      const sepaXPositions = [];
      for (let x = edgeM; x <= faceW - edgeM + 1; x += pitchH) {
        sepaXPositions.push(x);
      }

      // Check interference for each AB
      const results = [];
      ab.positions.forEach((abPos, i) => {
        const abX = abPos.x_mm;
        let minDist = Infinity;
        let nearestSepa = 0;
        sepaXPositions.forEach(sx => {
          const d = Math.abs(abX - sx);
          if (d < minDist) { minDist = d; nearestSepa = sx; }
        });
        results.push({
          abNo: i + 1,
          abX: abX,
          nearestSepaX: nearestSepa,
          clearance: minDist,
          ok: minDist >= minClearance
        });
      });

      const allOk = results.every(r => r.ok);
      const ngCount = results.filter(r => !r.ok).length;

      // Build result table
      let tableRows = results.map(r =>
        `<tr style="${r.ok ? '' : 'background:#ffeaea;'}">
          <td class="num">${r.abNo}</td>
          <td class="num">${r.abX.toLocaleString()}</td>
          <td class="num">${r.nearestSepaX.toLocaleString()}</td>
          <td class="num" style="font-weight:bold;color:${r.ok ? '#27ae60' : '#e74c3c'}">${r.clearance}</td>
          <td style="font-weight:bold;color:${r.ok ? '#27ae60' : '#e74c3c'}">${r.ok ? 'OK' : '★NG'}</td>
        </tr>`
      ).join('');

      div.innerHTML = `
        <div class="card">
          <div class="card-header">AB-セパ干渉チェック図
            <span class="badge ${allOk ? 'green' : ''}" style="${allOk ? '' : 'background:#e74c3c'}">${allOk ? '全AB OK' : `${ngCount}箇所 NG`}</span>
          </div>
          <div class="card-body">
            <div style="margin-bottom:12px;padding:10px;background:${allOk?'#eafaf1':'#fdecea'};border-radius:6px;border-left:4px solid ${allOk?'#27ae60':'#e74c3c'}">
              <strong>${allOk ? '全アンカーボルトの離隔OK' : `${ngCount}箇所で離隔不足（${minClearance}mm未満）`}</strong>
              <span style="font-size:12px;color:#666;margin-left:8px">判定基準: 離隔 ${minClearance}mm以上</span>
            </div>
            <div class="diagram-container" id="diagram-interference" style="min-height:300px"></div>
            <h4 style="margin-top:16px;margin-bottom:8px">判定詳細</h4>
            <table class="qty-table">
              <thead><tr><th>AB No.</th><th>AB位置(mm)</th><th>最近セパ(mm)</th><th>離隔(mm)</th><th>判定</th></tr></thead>
              <tbody>${tableRows}</tbody>
            </table>
            ${!allOk ? `<div class="note-card" style="margin-top:12px">
              <div class="note-cat">★対策案</div>
              <div class="note-text">
                ・AB近傍のセパ位置をずらす<br>
                ・AB位置のセパを省略し、隣のセパを太径に変更<br>
                ・セパピッチを調整（@${pitchH}mm → 要調整）
              </div>
            </div>` : ''}
          </div>
        </div>`;

      this.renderInterferenceDiagram(data, results, sepaXPositions);
    },

    renderInterferenceDiagram(data, results, sepaXPositions) {
      const el = document.getElementById('diagram-interference');
      if (!el) return;

      const ab = data.structure.anchor_bolts;
      let wallFace = null;
      (data.phases||[]).forEach(ph => { (ph.faces||[]).forEach(f => { if (f.id === 'WA') wallFace = f; }); });
      const sep = wallFace?.separators || {};
      const faceW = wallFace?.width_mm || 20000;
      const faceH = wallFace?.height_mm || 1050;
      const minClearance = wallFace?.interference_check?.min_clearance_mm || 50;
      const rowPositions = sep.row_positions_mm || [faceH/2];

      const marginL = 50, marginR = 30, marginT = 35, marginB = 40;
      const drawW = 900, drawH = 200;
      const svgW = drawW + marginL + marginR;
      const svgH = drawH + marginT + marginB;
      const scaleX = drawW / faceW;
      const scaleY = drawH / faceH;

      let svg = `<svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg" style="font-family:'BIZ UDPGothic','Meiryo',sans-serif">`;

      // Background
      svg += `<rect x="${marginL}" y="${marginT}" width="${drawW}" height="${drawH}" fill="#fafafa" stroke="#ccc" stroke-width="0.5"/>`;

      // Draw sepa positions
      sepaXPositions.forEach(sx => {
        const px = marginL + sx * scaleX;
        rowPositions.forEach(ry => {
          const py = marginT + (faceH - ry) * scaleY;
          svg += `<circle cx="${px}" cy="${py}" r="3" fill="#1a5276"/>`;
        });
      });

      // Draw AB positions with clearance indicators
      results.forEach(r => {
        const px = marginL + r.abX * scaleX;
        // Vertical dash line
        svg += `<line x1="${px}" y1="${marginT}" x2="${px}" y2="${marginT+drawH}" stroke="${r.ok ? '#27ae60' : '#e74c3c'}" stroke-width="0.8" stroke-dasharray="4,2"/>`;
        // Triangle at top
        const ty = marginT - 3;
        svg += `<polygon points="${px},${ty} ${px-6},${ty-12} ${px+6},${ty-12}" fill="${r.ok ? '#27ae60' : '#e74c3c'}" stroke="${r.ok ? '#1e8449' : '#c0392b'}" stroke-width="0.8"/>`;
        // AB label
        svg += `<text x="${px}" y="${ty-14}" text-anchor="middle" font-size="7" fill="${r.ok ? '#27ae60' : '#e74c3c'}">AB${r.abNo}</text>`;

        // Clearance label at each row
        rowPositions.forEach((ry, ri) => {
          if (ri === 0) { // show only on first row to avoid clutter
            const py = marginT + (faceH - ry) * scaleY;
            const nearPx = marginL + r.nearestSepaX * scaleX;
            // Clearance line
            if (Math.abs(px - nearPx) > 5) {
              svg += `<line x1="${Math.min(px,nearPx)}" y1="${py-8}" x2="${Math.max(px,nearPx)}" y2="${py-8}" stroke="${r.ok ? '#27ae60' : '#e74c3c'}" stroke-width="0.6"/>`;
              svg += `<text x="${(px+nearPx)/2}" y="${py-11}" text-anchor="middle" font-size="6" fill="${r.ok ? '#27ae60' : '#e74c3c'}">${r.clearance}mm</text>`;
            }
          }
        });

        // NG star
        if (!r.ok) {
          rowPositions.forEach(ry => {
            const py = marginT + (faceH - ry) * scaleY;
            svg += `<text x="${px}" y="${py+4}" text-anchor="middle" font-size="14" fill="#e74c3c">★</text>`;
          });
        }
      });

      // Row labels
      rowPositions.forEach((ry, i) => {
        const py = marginT + (faceH - ry) * scaleY;
        svg += `<text x="${marginL-5}" y="${py+3}" text-anchor="end" font-size="8" fill="#666">${i+1}段</text>`;
      });

      // Legend
      svg += `<circle cx="${marginL+10}" cy="${svgH-15}" r="3" fill="#1a5276"/>`;
      svg += `<text x="${marginL+18}" y="${svgH-12}" font-size="8" fill="#666">セパ位置</text>`;
      svg += `<polygon points="${marginL+80},${svgH-18} ${marginL+75},${svgH-10} ${marginL+85},${svgH-10}" fill="#27ae60"/>`;
      svg += `<text x="${marginL+92}" y="${svgH-12}" font-size="8" fill="#666">AB (OK)</text>`;
      svg += `<polygon points="${marginL+150},${svgH-18} ${marginL+145},${svgH-10} ${marginL+155},${svgH-10}" fill="#e74c3c"/>`;
      svg += `<text x="${marginL+162}" y="${svgH-12}" font-size="8" fill="#666">AB (NG)</text>`;
      svg += `<text x="${marginL+220}" y="${svgH-12}" font-size="8" fill="#e74c3c">★ 離隔不足</text>`;

      svg += `</svg>`;
      el.innerHTML = svg;
    },

    // ============================================================
    // 3D View — 展開図を折り畳んで立体化
    // ============================================================
    build3D(data, scene) {
      const s = data.structure;
      const curb = s.components?.curb || {};
      const barrier = s.components?.barrier || {};

      const L = curb.length_mm || 20000;
      const baseT = curb.base_thickness_mm || 100;
      const curbW = curb.width_mm || 350;
      const curbH = curb.height_mm || 350;
      const fH_c = 400;  // curb face height (from face data)
      const fH_w = 1050; // wall face height (from face data)
      const barrierWb = barrier.width_base_mm || 300;
      const bZoff = (curbW - barrierWb) / 2; // barrier offset from curb edge

      // Camera target: center of assembled model
      set3DCameraTarget(L / 2, (baseT + fH_c + fH_w) / 2, curbW / 2, Math.max(L * 0.5, 8000));

      // Slab reference
      const slabGeo = new THREE.BoxGeometry(L + 400, 60, curbW + 600);
      const slabMat = new THREE.MeshLambertMaterial({ color: 0xbbbbbb });
      const slab = new THREE.Mesh(slabGeo, slabMat);
      slab.position.set(L / 2, -30, curbW / 2);
      scene.add(slab);

      // Base plate (translucent)
      const baseGeo = new THREE.BoxGeometry(L, baseT, curb.base_width_mm || 500);
      const baseMat = new THREE.MeshLambertMaterial({ color: 0xd6eaf8, transparent: true, opacity: 0.4 });
      const baseMesh = new THREE.Mesh(baseGeo, baseMat);
      baseMesh.position.set(L / 2, baseT / 2, curbW / 2);
      scene.add(baseMesh);

      // Face data helper
      const ff = id => {
        for (const ph of (data.phases || [])) {
          for (const f of (ph.faces || [])) {
            if (f.id === id) return f;
          }
        }
        return { id, name: id, panels: [], separators: null };
      };

      // Create face meshes
      const caFace = ff('CA'), cbFace = ff('CB'), ctFace = ff('CT');
      const waFace = ff('WA'), wbFace = ff('WB');

      const caMesh = createFaceMesh(caFace, L, fH_c);
      const cbMesh = createFaceMesh(cbFace, L, fH_c);
      const ctMesh = createFaceMesh(ctFace, L, curbW);
      const waMesh = createFaceMesh(waFace, L, fH_w);
      const wbMesh = createFaceMesh(wbFace, L, fH_w);

      // Add all to scene
      [caMesh, cbMesh, ctMesh, waMesh, wbMesh].forEach(m => scene.add(m));

      // ---- Define folded & unfolded positions ----
      // Folded: assembled 3D positions
      // Unfolded: flat layout at Y=baseT level

      // Unfolded layout (flat, extending in ±Z from base line):
      //   WA -- CT -- CA -- [base Z=0..curbW] -- CB -- WB
      //   ←-Z                                      +Z→
      // CA extends from Z=0 to Z=-fH_c
      // CT extends from Z=-fH_c to Z=-(fH_c+curbW)
      // WA extends from Z=-(fH_c+curbW) to Z=-(fH_c+curbW+fH_w)
      // CB extends from Z=curbW to Z=curbW+fH_c
      // WB extends from Z=curbW+fH_c to Z=curbW+fH_c+fH_w

      const faces3D = [
        {
          mesh: caMesh,
          folded: {
            pos: [L/2, baseT + fH_c/2, 0],
            rot: [0, Math.PI, 0]  // face -Z (road side)
          },
          unfolded: {
            pos: [L/2, baseT, -fH_c/2],
            rot: [-Math.PI/2, 0, 0]  // flat
          }
        },
        {
          mesh: cbMesh,
          folded: {
            pos: [L/2, baseT + fH_c/2, curbW],
            rot: [0, 0, 0]  // face +Z (outer side)
          },
          unfolded: {
            pos: [L/2, baseT, curbW + fH_c/2],
            rot: [-Math.PI/2, 0, 0]
          }
        },
        {
          mesh: ctMesh,
          folded: {
            pos: [L/2, baseT + fH_c, curbW/2],
            rot: [-Math.PI/2, 0, 0]  // horizontal, face up
          },
          unfolded: {
            pos: [L/2, baseT, -(fH_c + curbW/2)],
            rot: [-Math.PI/2, 0, 0]
          }
        },
        {
          mesh: waMesh,
          folded: {
            pos: [L/2, baseT + fH_c + fH_w/2, bZoff],
            rot: [0, Math.PI, 0]  // face -Z (road side)
          },
          unfolded: {
            pos: [L/2, baseT, -(fH_c + curbW + fH_w/2)],
            rot: [-Math.PI/2, 0, 0]
          }
        },
        {
          mesh: wbMesh,
          folded: {
            pos: [L/2, baseT + fH_c + fH_w/2, bZoff + barrierWb],
            rot: [0, 0, 0]  // face +Z (outer side)
          },
          unfolded: {
            pos: [L/2, baseT, curbW + fH_c + fH_w/2],
            rot: [-Math.PI/2, 0, 0]
          }
        }
      ];

      // ---- End faces (妻型枠) ----
      // Curb end: L字断面 → 簡略化して矩形（curbW × fH_c）
      // Barrier end: 矩形（barrierWb × fH_w）
      // 2箇所（X=0 と X=L）

      const endColor = 0xf0e6d3; // 合板色
      const endMatCurb = new THREE.MeshLambertMaterial({ color: endColor, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
      const endMatBarrier = new THREE.MeshLambertMaterial({ color: 0xe8dcc8, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });

      [0, L].forEach((xPos, idx) => {
        // 地覆端部（curbW × fH_c）
        const ceGeo = new THREE.PlaneGeometry(curbW, fH_c);
        const ceMesh = new THREE.Mesh(ceGeo, endMatCurb.clone());
        scene.add(ceMesh);

        // 壁高欄端部（barrierWb × fH_w）
        const beGeo = new THREE.PlaneGeometry(barrierWb, fH_w);
        const beMesh = new THREE.Mesh(beGeo, endMatBarrier.clone());
        scene.add(beMesh);

        const endLabel = idx === 0 ? '始端' : '終端';

        faces3D.push(
          {
            mesh: ceMesh,
            folded: {
              pos: [xPos, baseT + fH_c/2, curbW/2],
              rot: [0, Math.PI/2, 0]  // face along X axis
            },
            unfolded: {
              // 展開時は横に少し離して平置き
              pos: [idx === 0 ? -fH_c/2 - 100 : L + fH_c/2 + 100, baseT, curbW/2],
              rot: [-Math.PI/2, 0, 0]
            }
          },
          {
            mesh: beMesh,
            folded: {
              pos: [xPos, baseT + fH_c + fH_w/2, bZoff + barrierWb/2],
              rot: [0, Math.PI/2, 0]
            },
            unfolded: {
              pos: [idx === 0 ? -fH_w/2 - fH_c - 200 : L + fH_w/2 + fH_c + 200, baseT, bZoff + barrierWb/2],
              rot: [-Math.PI/2, 0, 0]
            }
          }
        );
      });

      // ---- Edge lines for end faces (端部の輪郭線) ----
      const edgeLineMat = new THREE.LineBasicMaterial({ color: 0x8B6914 });
      [0, L].forEach(xPos => {
        // Curb端部の枠線
        const cPts = [
          new THREE.Vector3(xPos, baseT, 0),
          new THREE.Vector3(xPos, baseT + fH_c, 0),
          new THREE.Vector3(xPos, baseT + fH_c, curbW),
          new THREE.Vector3(xPos, baseT, curbW),
          new THREE.Vector3(xPos, baseT, 0),
        ];
        const cLineGeo = new THREE.BufferGeometry().setFromPoints(cPts);
        scene.add(new THREE.Line(cLineGeo, edgeLineMat));

        // Barrier端部の枠線
        const bPts = [
          new THREE.Vector3(xPos, baseT + fH_c, bZoff),
          new THREE.Vector3(xPos, baseT + fH_c + fH_w, bZoff),
          new THREE.Vector3(xPos, baseT + fH_c + fH_w, bZoff + barrierWb),
          new THREE.Vector3(xPos, baseT + fH_c, bZoff + barrierWb),
          new THREE.Vector3(xPos, baseT + fH_c, bZoff),
        ];
        const bLineGeo = new THREE.BufferGeometry().setFromPoints(bPts);
        scene.add(new THREE.Line(bLineGeo, edgeLineMat));
      });

      // Joint boards in 3D (actual size: thickness from JSON)
      const jointsData = data.structure?.joints;
      if (jointsData?.expansion_joints) {
        const jointColor = 0xcc3333;
        jointsData.expansion_joints.forEach(j => {
          const jx = j.position_mm;
          const jt = j.thickness_mm || 20; // actual thickness

          // Curb section joint board (curbW × fH_c × jt)
          const cjGeo = new THREE.BoxGeometry(jt, fH_c, curbW);
          const cjMat = new THREE.MeshLambertMaterial({ color: jointColor, transparent: true, opacity: 0.75 });
          const cjMesh = new THREE.Mesh(cjGeo, cjMat);
          cjMesh.position.set(jx, baseT + fH_c / 2, curbW / 2);
          scene.add(cjMesh);

          // Barrier section joint board (barrierWb × fH_w × jt)
          const bjGeo = new THREE.BoxGeometry(jt, fH_w, barrierWb);
          const bjMat = new THREE.MeshLambertMaterial({ color: jointColor, transparent: true, opacity: 0.75 });
          const bjMesh = new THREE.Mesh(bjGeo, bjMat);
          bjMesh.position.set(jx, baseT + fH_c + fH_w / 2, bZoff + barrierWb / 2);
          scene.add(bjMesh);

          // Edge highlight lines (red outline around joint)
          const edgeMat = new THREE.LineBasicMaterial({ color: 0xff0000 });
          // Curb joint outline
          const cPts = [
            new THREE.Vector3(jx, baseT, 0),
            new THREE.Vector3(jx, baseT + fH_c, 0),
            new THREE.Vector3(jx, baseT + fH_c, curbW),
            new THREE.Vector3(jx, baseT, curbW),
            new THREE.Vector3(jx, baseT, 0),
          ];
          scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(cPts), edgeMat));
          // Barrier joint outline
          const bPts = [
            new THREE.Vector3(jx, baseT + fH_c, bZoff),
            new THREE.Vector3(jx, baseT + fH_c + fH_w, bZoff),
            new THREE.Vector3(jx, baseT + fH_c + fH_w, bZoff + barrierWb),
            new THREE.Vector3(jx, baseT + fH_c, bZoff + barrierWb),
            new THREE.Vector3(jx, baseT + fH_c, bZoff),
          ];
          scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(bPts), edgeMat));
        });
      }

      // Set initial state (folded)
      faces3D.forEach(f => {
        f.mesh.position.set(...f.folded.pos);
        f.mesh.rotation.set(...f.folded.rot);
      });

      // Register for animation
      register3DFaces(faces3D);

      // AB markers (triangles on top of barrier)
      if (s.anchor_bolts?.positions) {
        s.anchor_bolts.positions.forEach(ab => {
          const coneGeo = new THREE.ConeGeometry(30, 80, 4);
          const coneMat = new THREE.MeshLambertMaterial({ color: 0xe74c3c });
          const cone = new THREE.Mesh(coneGeo, coneMat);
          cone.position.set(ab.x_mm, baseT + fH_c + fH_w + 50, curbW / 2);
          cone.rotation.z = Math.PI; // point down
          scene.add(cone);
        });
      }
    },

    // ============================================================
    // PDF Export
    // ============================================================
    exportPDF(data) {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
      const pw = 420, ph = 297, m = 15;

      // Page 1: Overview + Cross Section
      pdfDrawHeaderFooter(doc, '地覆・壁高欄 全体確認図', 1, 3);
      const overviewSvg = document.getElementById('crossSectionDiagram')?.innerHTML || '';
      doc.setFontSize(10);
      doc.text('断面図は画面をご確認ください', m + 10, m + 40);

      // Embed structure info
      const s = data.structure;
      const curb = s.components?.curb || {};
      const barrier = s.components?.barrier || {};
      let y = m + 55;
      doc.setFontSize(9);
      doc.setTextColor(0);
      doc.text(`地覆: ${curb.width_mm||'-'}mm × ${curb.height_mm||'-'}mm、底版${curb.base_width_mm||'-'}×${curb.base_thickness_mm||'-'}mm、延長${curb.length_mm ? (curb.length_mm/1000).toFixed(1)+'m' : '-'}`, m+10, y);
      y += 8;
      doc.text(`壁高欄: 天端${barrier.width_top_mm||'-'}mm / 基部${barrier.width_base_mm||'-'}mm × H${barrier.height_mm||'-'}mm、テーパー${barrier.taper?'あり':'なし'}`, m+10, y);
      y += 8;
      doc.text(`AB: M${s.anchor_bolts?.diameter_mm||'-'} @${s.anchor_bolts?.pitch_mm||'-'}mm × ${s.anchor_bolts?.positions?.length||'-'}本`, m+10, y);
      y += 8;
      doc.text(`打設方式: ${s.casting_method==='separate'?'別打ち':'一体打ち'}`, m+10, y);

      // Notes
      y += 12;
      doc.setFontSize(8);
      (data.notes||[]).forEach(n => {
        doc.setTextColor(200, 100, 0);
        doc.text(`[${n.category}]`, m+10, y);
        doc.setTextColor(80);
        doc.text(n.content.substring(0, 80), m+35, y);
        y += 6;
      });

      // Page 2: Face layouts (summary)
      doc.addPage('a3', 'landscape');
      pdfDrawHeaderFooter(doc, '各面割付図', 2, 3);
      y = m + 30;
      doc.setFontSize(10);
      doc.setTextColor(0);
      if (data.phases) {
        data.phases.forEach(phase => {
          doc.setFontSize(11);
          doc.text(`Phase ${phase.phase}: ${phase.name}`, m+10, y);
          y += 8;
          (phase.faces||[]).forEach(face => {
            doc.setFontSize(9);
            const sep2 = face.separators || {};
            doc.text(`  ${face.id}面: ${face.name} — ${face.width_mm?(face.width_mm/1000).toFixed(1)+'m':'-'} × ${face.height_mm||'-'}mm — パネル${face.panels?.length||0}枚 — セパ${sep2.count||0}本(${sep2.type||'-'})`, m+10, y);
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
      doc.text('型枠割付数量表', m+10, y);
      y += 8;
      doc.setFontSize(8);
      const q = data.quantities || {};
      (q.panels?.summary||[]).forEach(r => {
        doc.text(`${r.face}: ${r.size} ${r.type} × ${r.count}枚 = ${r.area_m2?.toFixed(2)||'-'}m2`, m+15, y);
        y += 5;
      });
      y += 5;
      doc.setFontSize(9);
      doc.text(`合計: ${q.panels?.total_count||0}枚 / ${q.panels?.total_area_m2?.toFixed(2)||'-'}m2`, m+15, y);

      const filename = `${data.project?.name||'parapet'}_型枠割付_${data.project?.created_at||'draft'}.pdf`;
      doc.save(filename);
    }
  };

  registerModule('parapet_curb_and_barrier', ParapetModule);
})();
