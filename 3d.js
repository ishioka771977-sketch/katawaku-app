// ============================================================
// 型知 KATACHI — 3D折り畳みエンジン (3d.js)
// 「展開図を折り畳んで3Dにする」
// ============================================================

(function() {
  let scene, camera, renderer;
  let isDragging = false, prevMouse = {x:0, y:0};
  let camTheta = Math.PI * 0.3, camPhi = Math.PI * 0.35, camRadius = 12000;
  let camTarget = { x: 10000, y: 600, z: 175 };
  let _3dFaces = [];
  let _3dFoldState = 1; // 1=folded, 0=unfolded
  let _3dInitialized = false;

  // ============================================================
  // Initialize 3D View
  // ============================================================
  window.init3DView = function(data) {
    if (typeof THREE === 'undefined') {
      console.warn('Three.js not loaded');
      return;
    }

    let viewDiv = document.getElementById('view-3d');
    if (!viewDiv) {
      viewDiv = document.createElement('div');
      viewDiv.id = 'view-3d';
      document.getElementById('mainArea').appendChild(viewDiv);
    }
    // Ensure visible (switchView already set display='')
    viewDiv.style.display = '';

    viewDiv.innerHTML = `
      <div class="card">
        <div class="card-header">3D確認 — 展開図の折り畳み
          <div class="btn-group" style="margin:0">
            <button class="btn btn-primary btn-sm" onclick="toggle3DFold()" id="btn3dFold">展開する</button>
            <button class="btn btn-sm" style="background:#666;color:#fff" onclick="reset3DCamera()">視点リセット</button>
          </div>
        </div>
        <div class="card-body" style="padding:0">
          <div id="three-container" style="width:100%;height:550px;background:#e8ecf0;position:relative">
            <div style="position:absolute;bottom:10px;left:10px;font-size:11px;color:#888;pointer-events:none">
              ドラッグ: 回転 ｜ スクロール: ズーム
            </div>
          </div>
        </div>
      </div>`;

    const container = document.getElementById('three-container');
    const w = container.clientWidth, h = container.clientHeight;

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe8ecf0);

    // Camera
    camera = new THREE.PerspectiveCamera(40, w / h, 1, 200000);
    updateCamera();

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.insertBefore(renderer.domElement, container.firstChild);

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dir1 = new THREE.DirectionalLight(0xffffff, 0.4);
    dir1.position.set(15000, 20000, 10000);
    scene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.15);
    dir2.position.set(-5000, 10000, -5000);
    scene.add(dir2);

    // Grid
    const grid = new THREE.GridHelper(40000, 40, 0xcccccc, 0xe0e0e0);
    scene.add(grid);

    // Axes helper (small)
    const axes = new THREE.AxesHelper(1000);
    axes.position.set(-500, 0, -500);
    scene.add(axes);

    // Controls
    setupControls(renderer.domElement);

    // Build model
    _3dFaces = [];
    _3dFoldState = 1;
    if (activeModule && activeModule.build3D) {
      try {
        activeModule.build3D(data, scene);
      } catch(e) {
        console.error('[3D] build3D error:', e);
      }
    }

    // Render loop
    _3dInitialized = true;
    function render() {
      if (!_3dInitialized) return;
      requestAnimationFrame(render);
      renderer.render(scene, camera);
    }
    render();

    // Resize
    const ro = new ResizeObserver(() => {
      const w2 = container.clientWidth, h2 = container.clientHeight;
      if (w2 > 0 && h2 > 0) {
        camera.aspect = w2 / h2;
        camera.updateProjectionMatrix();
        renderer.setSize(w2, h2);
      }
    });
    ro.observe(container);
  };

  // ============================================================
  // Camera
  // ============================================================
  function updateCamera() {
    if (!camera) return;
    camera.position.x = camTarget.x + camRadius * Math.sin(camPhi) * Math.cos(camTheta);
    camera.position.y = camTarget.y + camRadius * Math.cos(camPhi);
    camera.position.z = camTarget.z + camRadius * Math.sin(camPhi) * Math.sin(camTheta);
    camera.lookAt(camTarget.x, camTarget.y, camTarget.z);
  }

  window.reset3DCamera = function() {
    camTheta = Math.PI * 0.3;
    camPhi = Math.PI * 0.35;
    camRadius = 12000;
    updateCamera();
  };

  window.set3DCameraTarget = function(x, y, z, radius) {
    camTarget = { x, y, z };
    if (radius) camRadius = radius;
    updateCamera();
  };

  // ============================================================
  // Orbit Controls (mouse + touch)
  // ============================================================
  function setupControls(canvas) {
    canvas.addEventListener('mousedown', e => {
      isDragging = true;
      prevMouse = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('mousemove', e => {
      if (!isDragging) return;
      camTheta -= (e.clientX - prevMouse.x) * 0.005;
      camPhi = Math.max(0.05, Math.min(Math.PI - 0.05, camPhi - (e.clientY - prevMouse.y) * 0.005));
      prevMouse = { x: e.clientX, y: e.clientY };
      updateCamera();
    });
    canvas.addEventListener('mouseup', () => isDragging = false);
    canvas.addEventListener('mouseleave', () => isDragging = false);
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      camRadius = Math.max(2000, Math.min(50000, camRadius * (1 + e.deltaY * 0.001)));
      updateCamera();
    }, { passive: false });

    // Touch
    let td = 0;
    canvas.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        isDragging = true;
        prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        td = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                        e.touches[0].clientY - e.touches[1].clientY);
      }
    }, { passive: true });
    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      if (e.touches.length === 1 && isDragging) {
        camTheta -= (e.touches[0].clientX - prevMouse.x) * 0.005;
        camPhi = Math.max(0.05, Math.min(Math.PI - 0.05,
          camPhi - (e.touches[0].clientY - prevMouse.y) * 0.005));
        prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        updateCamera();
      } else if (e.touches.length === 2) {
        const nd = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                              e.touches[0].clientY - e.touches[1].clientY);
        camRadius = Math.max(2000, Math.min(50000, camRadius * (td / nd)));
        td = nd;
        updateCamera();
      }
    }, { passive: false });
    canvas.addEventListener('touchend', () => isDragging = false);
  }

  // ============================================================
  // Register 3D faces (called by modules)
  // ============================================================
  window.register3DFaces = function(faces) {
    _3dFaces = faces;
  };

  // ============================================================
  // Fold/Unfold Animation
  // ============================================================
  window.toggle3DFold = function() {
    if (!_3dFaces.length) return;

    const target = _3dFoldState > 0.5 ? 0 : 1;
    const start = _3dFoldState;
    const duration = 1800;
    const startTime = performance.now();

    // Update button text
    const btn = document.getElementById('btn3dFold');

    function anim(now) {
      let t = Math.min(1, (now - startTime) / duration);
      // Smooth ease in-out
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const s = start + (target - start) * ease;
      _3dFoldState = s;

      _3dFaces.forEach(f => {
        // Lerp position
        f.mesh.position.x = f.unfolded.pos[0] + (f.folded.pos[0] - f.unfolded.pos[0]) * s;
        f.mesh.position.y = f.unfolded.pos[1] + (f.folded.pos[1] - f.unfolded.pos[1]) * s;
        f.mesh.position.z = f.unfolded.pos[2] + (f.folded.pos[2] - f.unfolded.pos[2]) * s;

        // Lerp rotation (simple Euler lerp — works well for small angle differences)
        f.mesh.rotation.x = f.unfolded.rot[0] + (f.folded.rot[0] - f.unfolded.rot[0]) * s;
        f.mesh.rotation.y = f.unfolded.rot[1] + (f.folded.rot[1] - f.unfolded.rot[1]) * s;
        f.mesh.rotation.z = f.unfolded.rot[2] + (f.folded.rot[2] - f.unfolded.rot[2]) * s;
      });

      if (t < 1) {
        requestAnimationFrame(anim);
      } else {
        _3dFoldState = target;
        if (btn) btn.textContent = target > 0.5 ? '展開する' : '折り畳む';
      }
    }
    requestAnimationFrame(anim);
  };

  // ============================================================
  // Face Texture Creator (canvas → Three.js texture)
  // ============================================================
  window.createFaceTexture = function(face, faceW, faceH) {
    const canvas = document.createElement('canvas');
    const maxTex = 2048;
    const aspect = faceW / faceH;

    if (aspect > 1) {
      canvas.width = Math.min(maxTex, Math.max(512, Math.round(faceW * 0.08)));
      canvas.height = Math.max(64, Math.round(canvas.width / aspect));
    } else {
      canvas.height = Math.min(maxTex, Math.max(512, Math.round(faceH * 0.08)));
      canvas.width = Math.max(64, Math.round(canvas.height * aspect));
    }

    const ctx = canvas.getContext('2d');
    const scX = canvas.width / faceW;
    const scY = canvas.height / faceH;

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw panels
    const panels = face.panels || [];
    if (panels.length > 0) {
      let xOff = 0;
      panels.forEach(p => {
        const px = xOff * scX;
        const pw = p.width_mm * scX;

        ctx.fillStyle = p.type === 'カット' ? '#FFF3B0' : '#ffffff';
        ctx.fillRect(px, 0, pw, canvas.height);

        ctx.strokeStyle = '#999';
        ctx.lineWidth = Math.max(0.5, scX * 2);
        ctx.strokeRect(px, 0, pw, canvas.height);

        // Panel ID
        if (pw > 12) {
          ctx.fillStyle = '#444';
          ctx.font = `${Math.min(18, Math.max(6, pw * 0.25))}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(p.id || '', px + pw / 2, Math.min(24, canvas.height * 0.08) + 4);
        }
        xOff += p.width_mm;
      });
    } else {
      // No panels — fill with tint
      ctx.fillStyle = '#e8f0fe';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Draw separators
    const sep = face.separators;
    if (sep && sep.type) {
      const pitchH = sep.pitch_h_mm || 600;
      const edgeM = sep.edge_margin_mm || 150;
      const rowPos = sep.row_positions_mm || [faceH / 2];
      const isB = sep.type === 'B型';

      for (let x = edgeM; x <= faceW - edgeM + 1; x += pitchH) {
        rowPos.forEach(ry => {
          const sx = x * scX;
          const sy = (faceH - ry) * scY;
          const r = Math.max(2, 5 * scX);

          ctx.beginPath();
          ctx.arc(sx, sy, r, 0, Math.PI * 2);
          if (isB) {
            ctx.fillStyle = '#1a5276';
            ctx.fill();
          } else {
            ctx.strokeStyle = '#1a5276';
            ctx.lineWidth = Math.max(1, 2 * scX);
            ctx.stroke();
          }
        });
      }
    }

    // Border
    ctx.strokeStyle = '#1a5276';
    ctx.lineWidth = 3;
    ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);

    // Face ID label (center)
    if (face.id) {
      const label = face.id + '面';
      ctx.fillStyle = 'rgba(26, 82, 118, 0.7)';
      ctx.font = `bold ${Math.min(60, Math.max(16, canvas.height * 0.2))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, canvas.width / 2, canvas.height / 2);

      // Face name (smaller)
      if (face.name) {
        ctx.fillStyle = 'rgba(100, 100, 100, 0.6)';
        ctx.font = `${Math.min(24, Math.max(8, canvas.height * 0.08))}px sans-serif`;
        ctx.fillText(face.name, canvas.width / 2, canvas.height * 0.65);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  };

  // ============================================================
  // Helper: Create face mesh
  // ============================================================
  window.createFaceMesh = function(faceData, w, h) {
    const tex = createFaceTexture(faceData, w, h);
    const geo = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshLambertMaterial({
      map: tex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92
    });
    return new THREE.Mesh(geo, mat);
  };

})();
