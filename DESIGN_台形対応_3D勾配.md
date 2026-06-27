# カタチ 3D 台形（四隅自由）対応 — 設計書

> 目的: 横断/縦断勾配・テーパ壁・ハンチ等で生じる「面が長方形でなくなる」ケースを、
> 3D で正しく表現できるようにする。現状ボトルネック＝面が `PlaneGeometry(w,h)`（長方形固定）。

作成: 2026-06-27 / 対象: katawaku-app（カタチ）

---

## 1. 背景（現状の事実）

- 3D は「展開図を長方形の面に分けて折り畳む」方式（[3d.js](3d.js)）。
- 面の生成は `window.createFaceMesh(faceData, w, h)` → `THREE.PlaneGeometry(w, h)` の**長方形**＋キャンバステクスチャ（[3d.js:359](3d.js:359)）。全モジュールで計52回使用。
- 各面は `folded` / `unfolded` の `{pos:[x,y,z], rot:[rx,ry,rz]}` を登録し、剛体として位置・回転を補間して折り畳む（[3d.js:225](3d.js:225)）。
- 勾配（`wall_slope` 等）は **2D 図とセパ計算表でのみ**使用。3D の面は長方形のまま固定 Z に配置（例: 擁壁前面 A 面 = `length × wallH` の長方形、[retaining_wall.js:846](modules/retaining_wall.js:846)）。
- `angle_deg` はモジュールで未使用、`cut_note`（104件）は描画未使用＝**斜め要素は注記止まり**。

## 2. スコープ（この設計が解く／解かない）

**解く（今回）**
- 面が **四角形だが長方形でない**（台形・平行四辺形）ケース:
  - テーパ壁の妻側（C/D）面: 下底 `tBot` / 上底 `tTop`。
  - 縦断勾配で天端が傾く面（上辺と下辺の高さ/長さが違う）。
  - ハンチの三角形/台形バンド（現状 parapet で 45°長方形バンド近似しているもの）。

**解かない（別タスク）**
- パネル内の**角度付きカット**を実線として描く（＝`cut_note` の実ジオメトリ化）。
- **複数構造物の取り合い**（共有座標シーン化）。
- 曲線・ねじれ面（スパイラル等）。

> ※「面ごと傾くだけ（長方形のまま回転）」のケースは既に `rot` で表現可能。今回必要なのは
> **面そのものが非長方形**になるケース。

## 3. API 設計

### 3.1 `createFaceMesh` を後方互換で拡張

```js
// 既存: createFaceMesh(faceData, w, h)  → 長方形（従来通り）
// 拡張: 第4引数 corners を渡すと任意四角形（台形）になる
window.createFaceMesh = function(faceData, w, h, corners /* optional */) {
  const tex = createFaceTexture(faceData, w, h); // テクスチャは従来の「展開長方形」基準のまま
  const geo = corners
    ? buildQuadGeometry(corners, w, h)   // 任意四隅
    : new THREE.PlaneGeometry(w, h);     // 従来
  const mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
  return new THREE.Mesh(geo, mat);
};
```

- `corners`: 面ローカル平面上の4点 `[[x,y],[x,y],[x,y],[x,y]]`（左下→右下→右上→左上）。
  - 省略時は `[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]]`＝従来の長方形と一致。
- **テクスチャは「展開した長方形」基準のまま**（パネル幅・セパ位置は展開長で正しい）。
  UV は四隅 → `(0,0)(1,0)(1,1)(0,1)` に固定マップ。台形は UV 的に引き伸ばされるが、
  型枠の展開図としては「展開長で割付 → 空間では台形に置く」が物理的に正しい。

### 3.2 四隅ジオメトリ生成

```js
function buildQuadGeometry(c /* [[x,y]×4] 左下,右下,右上,左上 */, w, h) {
  const g = new THREE.BufferGeometry();
  const v = new Float32Array([
    c[0][0],c[0][1],0,  c[1][0],c[1][1],0,  c[2][0],c[2][1],0, // 三角形1: 左下,右下,右上
    c[0][0],c[0][1],0,  c[2][0],c[2][1],0,  c[3][0],c[3][1],0, // 三角形2: 左下,右上,左上
  ]);
  const uv = new Float32Array([0,0, 1,0, 1,1,  0,0, 1,1, 0,1]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
```

> 既存コードは既に `THREE.Shape` / `ExtrudeGeometry` を使用済み（parapet 断面・box_culvert ハンチ）。
> 四隅 BufferGeometry はその延長で、依存追加なし。

## 4. 折り畳みアニメとの互換性

- フォールドは **mesh.position / rotation を剛体補間**するだけ（[3d.js:225](3d.js:225)）。
- 形状（台形）はジオメトリに焼き込まれるので、**フォールド処理は一切変更不要**。
  剛体の四角形が折り畳まれるだけ。
- `unfolded`（展開）状態では台形がそのまま平面に寝る＝展開図としても妥当
  （テーパ妻面は展開しても台形なので正しい）。

## 5. 各モジュールへの波及（ここが工数の本体）

- 変更は「**非長方形にしたい面だけ**」`createFaceMesh(..., corners)` に四隅を渡す。
  他の面は引数省略で従来通り → **段階導入できる**。
- ヘルパを用意して各モジュールの記述を簡潔に:

```js
// 縦断勾配: 上辺だけ左右で高さが違う台形
quadFromTopSlope(w, hL, hR)  // → [[-w/2,0],[w/2,0],[w/2,hR],[-w/2,hL]]
// テーパ: 下底 wBot / 上底 wTop の対称台形
quadFromTaper(wBot, wTop, h) // → [[-wBot/2,0],[wBot/2,0],[wTop/2,h],[-wTop/2,h]]
```

- 折り畳み時の `folded.pos/rot` は、台形の**重心**基準に合わせて微調整が要る面あり。

## 6. 段階導入プラン

1. **実証（PoC）**: 擁壁 C/D（妻側）面を `quadFromTaper(tBot, tTop, wallH)` で台形化。
   1面だけで「テーパが3Dに出る」ことを確認。リスク最小。
2. 擁壁前面/背面の縦断勾配対応 → 横展開（橋台・パラペット・ピア）。
3. ハンチの45°長方形近似（parapet）を台形/三角形ジオメトリに置換。
4. JSON スキーマに勾配を素直に書ける項目を整備し、セットアップ md に実例追加
   （AI が四隅を直接書くのではなく、`wall_slope` 等の既存パラメータ→モジュールが四隅算出）。

> 重要: **AI/JSON 側は「勾配パラメータ」を書くだけ**にし、四隅算出はモジュールが担う。
> JSON に生の頂点座標を書かせると破綻するため。これは md だけでは解決しない＝本設計が前提。

## 7. 要決定事項

- **A. パネル割付は展開長基準のままで良いか**（推奨: 良い。型枠は平板を割り付けるため）。
  → 台形でもパネルは展開長で割付、空間で台形配置。視覚上パネル線が上下で開くのは許容。
- **B. セパ位置**（`row_positions_mm`）は台形で上に行くほど内側に寄せる必要があるか。
  → PoC では従来（展開基準）で可。精度要求が出たら台形 UV 補正を検討。
- **C. ハンチ**: 三角形（v3 頂点）まで対応するか、台形で代替するか。

## 8. 工数感（目安）

- 3d.js のコア拡張（`createFaceMesh` + `buildQuadGeometry` + ヘルパ）: 小（~半日）。
- 擁壁 PoC: 小（~半日）。
- 全モジュール横展開＋ハンチ置換: 中（モジュール数×面数。1〜2週間規模、段階リリース可）。

---

### まとめ
ボトルネックは `PlaneGeometry(w,h)` の長方形固定 1点。ここを「四隅自由」に一般化すれば、
折り畳みエンジン・テクスチャ・後方互換を壊さずに横断/縦断勾配・テーパ・ハンチを表現できる。
JSON/md 側は勾配パラメータを渡すだけにし、四隅算出はモジュールに閉じ込めるのが要。
