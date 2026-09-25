# 型知 KATACHI — くろたんJSON作成ガイド

## このドキュメントの目的
くろたん（JSON生成AI）が、実際の工事データからコドたん（型知KATACHIアプリ）用のJSONを作成するための仕様書。

---

## 全体の流れ

```
ひでさんが工事情報を提供
  ↓
くろたんがJSONを生成（このドキュメントに従う）
  ↓
型知KATACHIアプリ（コドたん製）が自動で：
  - 全体確認図（overview）
  - 面別割付図（面図＋SVG）
  - 数量表
  - 3D折り畳み表示
  - PDF/Excel出力
```

---

## 対応する7つの構造物タイプ

| # | type値（必須） | 日本語名 | 主な対象 |
|---|---|---|---|
| 1 | `deck_slab` | 床版 | 橋梁床版（合成床版・RC床版） |
| 2 | `parapet_curb_and_barrier` | 地覆・壁高欄 | 橋梁の地覆＋壁高欄 |
| 3 | `abutment` | 橋台 | 逆T式橋台（フーチング＋竪壁＋パラペット＋翼壁） |
| 4 | `pier` | 橋脚 | 壁式橋脚（フーチング＋躯体＋梁部） |
| 5 | `box_culvert` | BOXカルバート | 1連・2連ボックスカルバート |
| 6 | `retaining_wall` | 擁壁 | 逆T式擁壁 |
| 7 | `foundation` | 基礎 | 独立フーチング基礎 |

---

## 【3D対応範囲｜JSONを書く前に必ず確認】（2026-07-04 v4改訂）

JSONを書き始める前に、この表で「描ける形か」を必ず確認する。

### 描ける形（勾配・テーパは下記パラメータで渡す）

| 構造物 | 形状 | 使うパラメータ（正確なキー名） |
|---|---|---|
| 擁壁 | 前面勾配 | `dimensions.wall_slope`（または `wall_thickness_top_mm` / `wall_thickness_bottom_mm`） |
| 橋台 | 竪壁テーパ | `stem.thickness_top_mm` / `thickness_bottom_mm` ＋ `taper: true` ＋ `taper_face` |
| 橋台 | 翼壁の縦断（高さ変化） | `wing_wall.height_start_mm` / `height_end_mm` |
| 床版 | むくり（横断勾配） | `dimensions.camber_mm`（2D断面＋3D誇張曲線） |
| 床版 | 縦断勾配（橋軸方向） | `dimensions.longitudinal_slope_percent`（%。符号規約は下記） |
| 床版 | 主桁ハンチ（一様） | `dimensions.haunch_depth_mm` / `haunch_width_mm` |
| BOX | 隅角ハンチ（一様） | `haunch_size_mm` |
| 地覆・壁高欄 | 前面勾配ハンチ（一様） | `haunch_w_mm` / `haunch_h_mm` / `haunch_development_mm` |
| 床版 | **斜橋の斜角（deck_slabのみ）** | `dimensions.skew_angle_deg` ＋ `skew_direction`（書き方は下記「斜角の書き方」を必読） |
| 地覆・壁高欄 | **斜橋の斜め端部（両端部のみ・v7昇格）** | `structure` 直下に `skew_angle_deg` ＋ `skew_direction`（書き方は下記「斜角の書き方」8項） |

**`taper_face` の値**: `"back"`（背面のみ傾斜・既定）／`"front"`／`"both"`（対称）。
既定が背面である根拠: 道路構造物の竪壁・擁壁は前面（見える側）を鉛直仕上げとするのが通例のため。前面傾斜の特殊形状に出会ったときだけ `"front"` を明示する。

**壁高欄のテーパ**（`width_top_mm` / `width_base_mm` ＋ `taper: true`）: **2D断面図と数量には反映されるが、3Dは基部幅の長方形近似（テーパは3D未反映）**。JSON化してよいが、3D確認では壁高欄のテーパは出ないことを承知しておく。

### 描けない形（JSON化しない。下記の定型文で申告する）

- 拡幅部（幅員が橋軸方向に変化する床版。取付部の補修で頻出）
- 橋脚躯体・梁のテーパ（pier は現状テーパ全面非対応。2Dも3Dも一定断面のみ）
- 長さ方向に変化する非一様ハンチ（橋脚梁の支点ハンチ等）
- 他構造物との取り合い（地覆↔床版の打継ぎ、壁高欄↔地覆の目地一致、竪壁↔翼壁の接続角度）
- 横断勾配が橋軸方向に変化する真のねじれ面（むくり＋縦断の単純併用は可）

**申告の定型文（田中さんにこのまま言う）**:
「この形状（○○）は型知の3Dが現状非対応です。JSONは作りません。ひでさんに『○○が3D非対応だった』と伝えてください。あわせて会話末尾の知見サマリーに category: 3D非対応 で1件残します。」

### 禁止事項（描画に乗らない＝「作ったつもり」になる）

- `angle_deg`・生の頂点座標・**`cut_note` の文章で構造物の形状（斜めカット等）を表現しない**。これらは3Dに反映されない。四隅の座標計算はアプリ側が行う。
- **パネルの加工メモとしての `cut_note`（例: `"cut_note": "高さ600mmカット"`）は従来通り使ってよい**。禁止は「cut_note で形状を作ったつもりになること」であって、カットパネルの注記は今まで通り必要。
- 未対応の形状は無理に近似JSONを出さず、上記の定型文で申告する。描けないものは書かない。

### 竪壁テーパ×リフトの書き方

`taper: true` ＋ `thickness_top_mm` / `thickness_bottom_mm` ＋ `taper_face` を指定。`lift_height_mm` / `lift_count` と併用可。各リフトの厚さは全体の高さから内挿されるため、リフトごとに厚さを書く必要はない（記入例は橋台セクションのJSON参照）。

### 縦断勾配の符号規約（ミス多発ポイント）

`longitudinal_slope_percent` は **正の値 ＝ A2側（橋軸の終点側）が上がる**。A1側（起点側）が支点。
例: 2.0 → A2側が 33,000×2% = 660mm 高い。A1/A2 のどちらが高いかを図面で確認し、高い方がA2になる向きで正の値で書くのが原則。

### 床版の3D確認について

床版にも3D確認ビューがある（本体＋底鋼板＋主桁＋側型枠4面＋ハンチ帯＋むくり誇張曲線）。側型枠の折り畳み展開にも対応。斜角時は床版が平行四辺形で描画され、主桁は支承線で階段状にずれる。

### 斜角の書き方（deck_slab限定・v6追加）

**昇格範囲はdeck_slab（床版）のみ**。地覆・壁高欄の斜め端部はS4完了まで「描けない形」のまま（上記参照）。

**1. 基本パラメータ（両方とも必ず明示する）**
```json
"dimensions": {
  "width_mm": 20500,
  "length_mm": 33000,
  "skew_angle_deg": 60,
  "skew_direction": "right"
}
```
- `skew_angle_deg`: 支承線と橋軸のなす角。90=直橋（この場合は書かなくてよい）。
- `skew_direction` の図面からの判読: **平面図を進行方向（A1→A2）に見て、桁端（支承線）が進行方向に対してどちらへ逃げているか**。B面（上流側）の桁端がA2寄りにずれていれば "right"、A1寄りなら "left"。迷ったら平面図の食い違いの向きをそのまま notes に書いて申告する。

**2. 妻面（A/A'）の寸法**
- `width_mm` は **幅員÷sin(斜角) の実長**で書く（例: 20,500/sin60° = 23,671mm）。
- アプリが±1mmで検証する。数量の妻型枠面積も直橋比 1/sin(斜角) 倍で検証される。

**3. 端部カットパネル（実数主義）**
- パネルは橋軸直角に流し、支承線にかかるパネルを斜めカットする。カット寸法＝そのパネルの橋軸方向位置÷tan(斜角)。
- **端数は実数で書く。272mmなら272と書く（270への丸め禁止）**。丸めると±1mm検証に落ちる。
- cut_note の様式（統一）: `"cut_note": "斜角60°端部・位置x=23400mm・カット寸法272mm"`

**4. セパ本数の式（アプリの検証式と同一）**
```
期待本数 = ( floor( (面幅 − 2×端あき) ÷ ピッチ ) + 1 ) × 段数
```
例: 妻面23,672mm・端あき150・ピッチ600・1段 → floor(23372/600)+1 = 39本。この式で計算してから count に書く。

**5. ロス数量**
- 端部カットの切り捨ては**実カット寸法の積み上げ**で quantities に計上する。ロス率は検算用の参考値。

**6. 検証カードの読み方（⚠が出たときの自己修正手順）**
- 「妻面長 ⚠」→ width_mm を 幅員÷sin(斜角) で再計算して書き直す
- 「型枠面積 ⚠」→ quantities の妻型枠面積を 直橋値×1/sin(斜角) で再計算
- 「パネル幅合計 ⚠」→ panels 配列を再割付（合計が面幅と±1mmで一致するまで）
- 「セパ本数 ⚠」→ 上記4の式で再計算して count を書き直す
- ⚠をゼロにしてから納品する。直せない⚠だけ人間に申告する。

**7. 強斜橋（端部カット帯が数段に及ぶ場合）**
- 割付方針を型枠大工に確認し、結果を notes に申し送る。あわせて知見サマリーに category: 3D非対応 で1件残す（実例が2〜3件溜まったら切替目安を数値化する）。

**8. 地覆・壁高欄の斜め端部（v7追加・「端部だけ」の問題）**
- 斜角が効くのは**両端部の幾何だけ**。本体（断面・延長・パネル割付・セパ・リフト）は**直橋と完全に同じに書く**。deck_slabのような全体の平行四辺形化はしない。
- `structure` 直下に `skew_angle_deg` と `skew_direction` を明示（deck_slabと同語彙）。`length_mm` は**車道側面基準**の長さ。
- **ABの `positions[].x_mm` は従来通り「A1端の橋軸直交面からの追い距離（直角投影）」で書く**。斜め妻面起点にしない（側面ごとに基点が変わり事故る）。
- アプリが「斜め端部検証」カードで自動計算する: 妻面幅（幅÷sinθ）／側面長差（幅÷tanθ）／**AB端部余裕（最小）=min(先頭x, L−末尾x)−幅÷tanθ**。余裕が負＝ABが斜め端面からはみ出し＝⚠が出るのでAB配置を見直す。
- 目地一致（connections の joint_alignment）は**直角投影（橋軸沿いの追い距離）で測る**。床版の目地定義と同じ。
- **3Dは端部の斜めを表現しない**（本体不変のため直橋表示のまま）。寸法・数量・検証カードが対応するので、端部カット寸法はそちらで確認する。

---

## 共通JSON構造

全タイプ共通のトップレベル構造：

```json
{
  "project": {
    "name": "工事名",
    "contractor": "施工者名",
    "created_at": "2026-XX-XX",
    "created_by": "くろたん"
  },
  "structure": {
    "type": "★ここに上記type値★",
    "name": "構造物名",
    ...各タイプ固有のフィールド...
    "joints": { ... },
    "cover": { ... }
  },
  "phases": [ ... ],
  "quantities": { ... },
  "notes": [ ... ]
}
```

---

## 共通：面（face）オブジェクト

phases配列の中のfacesに入る。1面 = 1枚の型枠展開面。

```json
{
  "id": "A",
  "name": "前面（仕上げ面）",
  "face_type": "side",
  "width_mm": 10000,
  "height_mm": 3000,
  "finish": "打放し",
  "layout_method": "左詰め・端部カット調整",
  "panels": [
    {
      "id": "A-1-01",
      "row": 1, "col": 1,
      "width_mm": 900, "height_mm": 900,
      "type": "定尺",
      "orientation": "横"
    },
    {
      "id": "A-1-02",
      "row": 1, "col": 2,
      "width_mm": 900, "height_mm": 900,
      "type": "定尺",
      "orientation": "横"
    },
    {
      "id": "A-2-01",
      "row": 2, "col": 1,
      "width_mm": 900, "height_mm": 600,
      "type": "カット",
      "orientation": "横",
      "cut_note": "高さ600mmカット"
    }
  ],
  "separators": {
    "type": "C型",
    "diameter": "2分5厘",
    "pitch_h_mm": 600,
    "pitch_v_mm": 450,
    "edge_margin_mm": 150,
    "rows": 2,
    "row_positions_mm": [450, 1050],
    "length_mm": 300,
    "wall_thickness_mm": 300,
    "count": 30
  }
}
```

### パネル割付ルール

1. **コンパネ原板サイズ**: 900mm × 1800mm
2. **使い方**: 横使い（900mm高×1800mm幅）が基本。高さが900mm超なら縦使い。
3. **割付方向**: 左端から順に並べる（片追い）
4. **端部処理**: 最後の1枚をカットして調整
5. **type値**: `"定尺"` = 原板そのまま、`"カット"` = カット加工
6. **ID命名**: `"{面ID}-{段}-{列}"` 例: `"A-2-03"` = A面の2段目3列目

### セパレーター選定ルール

| セパ種別 | 記号 | 用途 |
|---|---|---|
| B型（●） | `"B型"` | 仕上げ面（打放し）。Pコン穴が残る |
| C型（○） | `"C型"` | 埋戻し面・一般面。ナット締め |

| セパ径 | 条件 |
|---|---|
| `"2分5厘"` | 側圧50kN/m²以下（一般的） |
| `"W3/8"` | 側圧50kN/m²超、リフト高1.5m以上 |

| 項目 | 標準値 |
|---|---|
| 水平ピッチ | 600mm |
| 鉛直ピッチ | 450mm |
| 端あき | 150mm |
| セパ長 | 壁厚 + コンパネ12mm×2 = 壁厚+24mm |

### セパがない面
フーチング等で控え杭による場合：
```json
"separators": null,
"support": { "type": "控え杭", "spec": "H-200" }
```

---

## 共通：目地（joints）

```json
"joints": {
  "expansion_joints": [
    {
      "position_mm": 5000,
      "type": "伸縮目地",
      "material": "瀝青質ボード",
      "thickness_mm": 20,
      "waterstop": {
        "exists": true,
        "type": "膨張止水材 CC200×5"
      },
      "sealant": {
        "exists": true,
        "type": "ポリウレタン系",
        "width_mm": 20,
        "depth_mm": 15
      }
    }
  ],
  "construction_joints": [
    {
      "position": "底版→壁体",
      "direction": "horizontal",
      "treatment": "レイタンス除去・チッピング・湿潤",
      "waterstop": { "exists": true, "type": "PVC止水板 CC200" }
    }
  ],
  "expansion_joint_interval_mm": 10000,
  "expansion_joint_material": "瀝青質ボード t=20mm",
  "note": "備考テキスト"
}
```

### 目地の判断基準

| 構造物 | 伸縮目地 | 打継目地 |
|---|---|---|
| 床版 | なし（連続打設） | やむを得ない場合のみ（主桁上） |
| 地覆・壁高欄 | @10〜15m | 床版→地覆 |
| 橋台 | なし（1構造物完結） | フーチング→竪壁→パラペット |
| 橋脚 | なし | リフト間（フーチング→躯体→梁部） |
| BOXカルバート | @10m（延長による） | 底版→壁 |
| 擁壁 | @10m（延長10m超の場合） | 底版→壁体 |
| 基礎 | なし | 天端→上部工 |

---

## 共通：接続（connections）— 他構造物との取り合い（v5追加）

**他構造物に接する面があれば必ず書く**（面単位で「この面は何かに接するか？」を自問する方式）。
相手の構造物が型知に未登録でも、図面上の呼称で書いてよい（後からアプリが名寄せする）。

```json
"connections": [
  {
    "target_structure": "宿野辺橋 床版",
    "self_face": "CB",
    "target_face": "B'",
    "interface_type": "打継ぎ",
    "treatment": "チッピング＋レイタンス除去",
    "waterstop": false,
    "gap_mm": null,
    "offset_note": "地覆前面は床版端から50mm内側",
    "joint_alignment": "床版の伸縮目地位置に地覆目地を一致させる"
  }
]
```

- `interface_type` は次の**6語彙のみ**: 打継ぎ／伸縮目地／段差／密着（一体打ち）／差し筋・アンカー接合／遊間
- `gap_mm`: interface_type が「遊間」のとき**設計遊間量を数値で必ず入れる**（他の種別では省略）
- `target_face` は相手の面IDが分かる場合のみ（分からなければ省略可）
- 位置関係は当面 `offset_note` に文章で書く（数値座標は書かない）
- **密着（一体打ち）の面は型枠数量に計上しない**。相手構造物に密着する面（例: 地覆下端は床版天端に載る）は
  型枠不要なので、quantities のパネル・セパに入れない（入れると過剰計上になる）

---

## 共通：数量（quantities）

```json
"quantities": {
  "panels": {
    "summary": [
      { "face": "A面", "size": "900×900", "type": "定尺", "count": 6, "area_m2": 4.86 }
    ],
    "total_count": 48,
    "total_area_m2": 29.46
  },
  "separators": {
    "summary": [
      { "face": "A面", "type": "C型", "diameter": "2分5厘", "length_mm": 4024, "count": 20 }
    ],
    "total_count": 68
  },
  "hardware": {
    "formtie": { "spec": "W5/16", "count": 136, "note": "セパ×2" },
    "nut": { "spec": "W5/16六角", "count": 136 },
    "washer": { "spec": "W5/16用", "count": 136 }
  },
  "joints": {
    "summary": [
      { "name": "打継ぎ処理", "spec": "チッピング", "count": 1, "unit": "箇所" }
    ],
    "total_joints": 0
  },
  "misc": [
    { "name": "桟木", "spec": "30×60×3600", "count": 20, "unit": "本" },
    { "name": "面木", "spec": "15×15三角", "count": 40, "unit": "m" },
    { "name": "剥離剤", "spec": "鉱物油系", "count": 1, "unit": "缶" }
  ]
}
```

---

## 各タイプ固有の仕様

### 1. deck_slab（床版）

```json
"structure": {
  "type": "deck_slab",
  "subtype": "composite_steel_deck",
  "dimensions": {
    "width_mm": 20500,
    "length_mm": 33000,
    "thickness_mm": 178,
    "haunch_depth_mm": 50,
    "haunch_width_mm": 200,
    "camber_mm": 10,
    "longitudinal_slope_percent": 0
  },
  "girders": {
    "count": 16,
    "spacing_mm": 1340,
    "labels": ["G-1", "G-2", ...]
  },
  "base_plate": {
    "exists": true,
    "thickness_mm": 18,
    "material": "SM490YB"
  },
  "formwork_config": {
    "bottom_form_required": false,
    "side_form_required": true,
    "haunch_form_required": true,
    "shoring_required": false
  }
}
```

**面構成**: A/A'（橋軸方向端部）、B/B'（橋幅方向端部）、H（ハンチ）
**注意**: 合成床版は底鋼板が底型枠代わり。RC床版は底型枠＋支保工が必要。

---

### 2. parapet_curb_and_barrier（地覆・壁高欄）

```json
"structure": {
  "type": "parapet_curb_and_barrier",
  "casting_method": "separate",
  "components": {
    "curb": {
      "profile": "L_shape",
      "width_mm": 350,
      "height_mm": 350,
      "base_width_mm": 500,
      "base_thickness_mm": 100,
      "length_mm": 20000,
      "drain_pipe": { "diameter_mm": 30, "spacing_mm": 3000 }
    },
    "barrier": {
      "width_top_mm": 200,
      "width_base_mm": 300,
      "height_mm": 1000,
      "taper": true,
      "length_mm": 20000,
      "expansion_joint_pitch_mm": 12000
    }
  },
  "anchor_bolts": {
    "diameter_mm": 20,
    "pitch_mm": 2000,
    "embedment_mm": 250,
    "positions": [ { "x_mm": 1000 }, { "x_mm": 3000 }, ... ]
  }
}
```

**面構成**: Phase1 地覆（CA外面/CB内面/CT天端）、Phase2 壁高欄（WA車道側/WB外側）
**注意**: 壁高欄は打放し面→B型セパ＋Pコン。ABとセパの干渉チェック。

---

### 3. abutment（橋台）

```json
"structure": {
  "type": "abutment",
  "subtype": "inverted_T",
  "footing": {
    "width_mm": 6000,
    "depth_mm": 4000,
    "thickness_mm": 1500,
    "toe_length_mm": 1000,
    "heel_length_mm": 2500
  },
  "stem": {
    "height_mm": 5000,
    "thickness_top_mm": 800,
    "thickness_bottom_mm": 1200,
    "taper": true,
    "taper_face": "back",
    "lift_height_mm": 2500,
    "lift_count": 2
  },
  "parapet": {
    "height_mm": 800,
    "width_mm": 1500,
    "bearing_seat": { "width_mm": 600, "depth_mm": 400 }
  },
  "wing_wall": {
    "type": "parallel",
    "length_mm": 3000,
    "height_start_mm": 5000,
    "height_end_mm": 1500,
    "thickness_mm": 400
  }
}
```

**面構成**: Phase1 フーチング(F-A〜F-D)、Phase2-3 竪壁リフト(S-A/S-B)、Phase4 パラペット(P-A)、Phase5 翼壁(W-L/W-R)
**注意**: フーチングはセパなし（控え杭）。竪壁はテーパーあり。翼壁は高さが変化。

---

### 4. pier（橋脚）

```json
"structure": {
  "type": "pier",
  "footing": {
    "width_mm": 10000,
    "depth_mm": 6000,
    "thickness_mm": 2500
  },
  "body": {
    "shape": "wall",
    "width_mm": 6000,
    "thickness_mm": 2000,
    "height_mm": 15000,
    "lift_height_mm": 3000,
    "lift_count": 5
  },
  "cap_beam": {
    "width_mm": 10000,
    "depth_mm": 2000,
    "height_mm": 2000,
    "cantilever_mm": 2000,
    "shoring_type": "bracket"
  }
}
```

**面構成**: Phase1 フーチング(F-A〜F-D)、Phase2-6 躯体リフト1-5(B-A/B-B)、Phase7 梁部(C-BT/C-A/C-B)
**注意**: リフト高1.5m超→W3/8セパ推奨。側圧P = 24×H（上限100kN/m²）。梁部はブラケット支保工。

---

### 5. box_culvert（BOXカルバート）

```json
"structure": {
  "type": "box_culvert",
  "subtype": "single",
  "dimensions": {
    "inner_width_mm": 3000,
    "inner_height_mm": 3000,
    "top_slab_thickness_mm": 400,
    "bottom_slab_thickness_mm": 500,
    "wall_thickness_mm": 400,
    "haunch_size_mm": 200,
    "span_length_mm": 10000,
    "span_count": 1
  },
  "casting_method": "2回打設",
  "construction_joint": {
    "base_to_wall": { "waterstop": true, "type": "PVC_CC200" },
    "expansion_joint": { "interval_mm": 10000, "material": "20mm_filler" }
  },
  "shoring": {
    "top_slab": {
      "type": "pipe_support",
      "spacing_mm": 900,
      "girder": "90x90_timber",
      "joist": "45x90_timber @300"
    }
  }
}
```

**面構成**: Phase1 底版(BL/BR)、Phase2 壁+頂版(A外/B内/C外/D内/T底面)
**注意**: 内面(B/D)はB型セパ（水路仕上げ）、外面(A/C)はC型セパ。ハンチ4箇所。頂版底面は支保工。

---

### 6. retaining_wall（擁壁）

```json
"structure": {
  "type": "retaining_wall",
  "subtype": "inverted_T",
  "dimensions": {
    "wall_height_mm": 3000,
    "wall_thickness_bottom_mm": 300,
    "wall_thickness_top_mm": 250,
    "wall_slope": 0.05,
    "base_width_mm": 2500,
    "base_thickness_mm": 500,
    "toe_length_mm": 500,
    "heel_length_mm": 1700,
    "length_mm": 10000
  },
  "construction_joint": {
    "base_to_wall": {
      "waterstop": true,
      "waterstop_type": "PVC_CC200x5",
      "treatment": "レイタンス除去・チッピング・湿潤"
    }
  },
  "drain_pipe": {
    "type": "VP75",
    "spacing": "2〜3m²に1箇所",
    "slope_percent": 2
  }
}
```

**面構成**: Phase1 底版(E前面/F背面)、Phase2 壁体(A前面/B背面/C左端/D右端)
**注意**: 前面(A)はB型（仕上げ面）、背面(B)はC型（埋戻し面）。壁体に勾配あり→セパ長が段ごとに異なる。水抜きパイプ位置を指定可能。

---

### 7. foundation（基礎）

```json
"structure": {
  "type": "foundation",
  "subtype": "footing",
  "dimensions": {
    "width_mm": 4000,
    "length_mm": 6000,
    "height_mm": 1500
  },
  "corner_detail": {
    "large_faces": ["A", "C"],
    "small_faces": ["B", "D"],
    "note": "大面が相手面のコンパネ厚12mm分延長"
  },
  "sepa_feasibility": {
    "width_4000": "対面セパ可（幅4m以下）",
    "length_6000": "対面セパ可（長尺注意 4〜6m）"
  },
  "leveling_concrete": {
    "thickness_mm": 50
  }
}
```

**面構成**: Phase1 フーチング(A/B/C/D の4面)
**注意**: 大面(A/C)がコーナーで12mm延長。セパ長 = 対面間距離 + 24mm。4面展開図機能あり。

---

## くろたんへのお願い事項

### 必ず守ること
1. **`structure.type` は上記7種のいずれかを正確に指定**する
2. **面IDは一意**にする（同じphase内で重複不可）
3. **パネルのwidth_mmの合計 = face.width_mm** になるようにする
4. **セパcount** は実際に計算した値を入れる（式: (floor((面幅−2×端あき)÷ピッチ)+1)×段数。「斜角の書き方」4項と同一の式）
5. **単位はすべてmm**（m換算はアプリ側で行う）
6. **【3D対応範囲】表を確認してからJSONを書く**（「対応する7つの構造物タイプ」直後の表。描けない形は定型文で申告）
7. **他構造物に接する面があれば connections を必ず書く**（相手未登録でも図面呼称で。密着面は型枠数量に計上しない）

### 判断が必要なポイント
1. **セパ種別（B型/C型）**: 仕上げ面→B型、埋戻し面→C型
2. **セパ径**: リフト高・側圧から判断
3. **目地の要否**: 構造物延長・打設回数から判断
4. **パネルの向き**: 高さに応じて横使い/縦使い
5. **リフト分割**: 高さ・側圧・打設計画から判断

### あると嬉しい情報
- 工事名・施工者名
- 構造物の寸法（設計図から）
- コンクリート強度・スランプ
- 仕上げ面の指定
- 打設計画（フェーズ分け）
- かぶり厚

---

## サンプルJSONの場所
`katawaku-app/sample/` に7種すべてのサンプルあり。
迷ったらサンプルを参考にすること。

---

## アプリの機能（コドたんが自動処理するもの）
- 全体確認図（overview）の生成
- 面別割付図（SVG）の描画
- パネル・セパ・目地の3D表示（折り畳みアニメーション付き）
- 数量集計表の生成
- PDF出力（A3横）
- Excel出力

**くろたんはJSONを正しく作るだけでOK。描画・計算・出力はすべてコドたんが担当。**

---

## 会話の最後に必ず出力すること：知見サマリー（v2追加）

このセクションは v3.4 知見循環システム連携用。**現場くろたんが田中さんとの壁打ちが終わる時に必ず実行する**。

### なぜこれをやるか

現場くろたんと田中さんの壁打ちで生まれた知見（セパの判断、現場特有の制約、設計変更の根拠など）を、構造化して中央に蓄積する仕組み。これにより、田中さんが次に壁打ちする時、過去の現場で得られた判断材料が**最新版の引き継ぎ書として戻ってくる**。

田中さんの手作業はゼロ。型知アプリが裏で自動パースする。**くろたんが正しく出力するだけで、知見が組織の財産になる**。

### 出力タイミング
- 壁打ちの区切りが示された時
- JSON生成が完了した時
- 議論が一段落した時（くろたんの判断）

迷ったら出す。出さないより出す方が運用上の害が少ない。

### 出力フォーマット（厳守）

くろたんは会話の最後に、以下を**そのままの形で**出力する。

```
---field_note_start---
project_name: <工事名>
date: <YYYY-MM-DD>
items:
  - category: <セパ／目地／支保工／設計変更／材料／施工順序／3D非対応／その他>
    title: <30字以内の見出し>
    content: <次回判断に役立つ具体的内容を3〜10行>
    source: <この会話／設計図／指示など>
---field_note_end---
```

### project_id について（重要：現場最優先設計）

**くろたんは project_id を訊かない**。田中さんは覚えていないし、ひでさんに毎回確認することもできない。

代わりに **`project_name`（工事名）だけ書く**。型知アプリ側が project_master を引いて自動で project_id に名寄せする。該当工事が見つからない時はアプリが project_name のまま記録し、ひでさんが棚卸し時に手動マッピングする。

この設計の核心：**くろたんは現場の頭脳を消費しない**。

### 出力すべきもの
- **3D非対応の形状に遭遇した記録（category: 3D非対応で必ず1件）**——どの形状が現場で何回発生したかがデータになり、アプリ改修の優先順位を決める材料になる
- 新しい型枠工法・寸法上の発見
- 現場特有の制約（地形・気候・近接構造物）
- 失敗パターン・ヒヤリハット
- 判断基準のアップデート
- 設計変更の根拠
- 材料・金物の代替案

### 出力すべきでないもの
- 標準示方書レベルの一般知識（このドキュメントに既に書いてあること）
- 単なる感想・所感
- 個人情報・人事評価

### 品質基準

| 観点 | やること |
|---|---|
| 具体的に | 数字・部位名・条件を明記。「セパが長い」ではなく「壁厚324mmでセパ長300mmだった」 |
| 再利用可能に | 他現場で参照できる粒度で。固有名詞は最小限 |
| 正直に | 不確実なことは「推測」と明記、盛らない |

### 出力例（参考）

```
---field_note_start---
project_name: 宿野辺橋床版工事
date: 2026-04-27
items:
  - category: セパ
    title: 合成床版ハンチ部のセパ干渉
    content: |
      ハンチ高50mm・幅200mmの合成床版で、ハンチ型枠のセパが
      下フランジのスタッドと干渉した。回避策として、ハンチ部分は
      セパを使わず仮設サポートで対応。スタッドピッチ200mmの場合に
      この問題が起きやすい。次回の合成床版工事では、ハンチ寸法と
      スタッドピッチを事前に設計図で照合する必要あり。
    source: この会話・宿野辺橋設計図 図面番号S-12

  - category: 設計変更
    title: 法面除雪費用の積算根拠
    content: |
      塩釜現場の冬期施工で法面除雪費用が約300万円発生。
      北海道開発局ガイドラインの「除雪・凍結防止対応」を根拠に
      設計変更協議が成立。施工協議簿は「気象条件による工法変更」
      で起案。寒冷地工事では同様の起案が活きる。
    source: 北海道開発局除雪ガイドライン・塩釜現場施工協議簿

---field_note_end---
```

### 守ること
- マークダウンの記号は厳密に同じ文字列にすること（`---field_note_start---` と `---field_note_end---` は英数字、ハイフン3つ、変えない）
- knowledge_summary や 知見サマリー など別タグは絶対に使わない
- 知見が見当たらない時は `items: []` の空配列で出力。タグ自体は省略しない
- 出力ブロックの前後に余計な装飾コメントを入れない（パースに影響）

### くろたんへの最後のお願い

田中さんは現場で疲れている。壁打ちの最後にこのブロックを必ず付けて、田中さんが「会話ログ全体をコピーして型知アプリに貼り付ける」だけで全部完了するようにしてくれ。**田中さんに何も訊かない、田中さんに何もさせない**。それが現場最優先の運用。

ひでさんが棚卸しに来た時、このフィールドノートが整理された材料になっていれば、組織の知見は確実に蓄積される。

---

## 追補v4（2026-07-23）: 地覆単体・台形断面（前面傾斜）— 型知 v8

### 地覆単体（壁高欄なし）の書き方
- `structure.components` から **barrier を書かなければ地覆単体**として扱われる（v8で対応済み。壁高欄・WA/WB面・壁高欄妻面・AB表示は自動で消える）。null明示や別typeは不要。
- `structure.type` は従来どおり `parapet_curb_and_barrier` でよい（エイリアス `curb` も同義で受け付ける）。
- 面構成は CA（外面・前面）/ CB（内面）/ CE1・CE2（妻面）のみ。CT（天端）はコテ仕上げで省略。
- 面の高さは face の height_mm がそのまま3Dに反映される（旧400mm固定は廃止）。

### 台形断面（前面傾斜）の書き方 — 宿野辺橋 地覆L側型
`components.curb` に以下を追加する:
```json
"curb": {
  "width_mm": 400,            // 下端幅
  "width_top_mm": 270,        // 上端幅（下端と違えば台形と判定）
  "front_slope_bottom_mm": 80, // 前面下部の垂直部高さ（無ければ0）
  "height_mm": 440,
  "length_mm": 33000
}
```
- 前面（CA側）が傾斜する。断面図・3D（傾斜面・六角形妻面・妻面枠線）に反映される。
- CA面の展開幅は従来どおり延長方向。**CA面の型枠高さは斜辺長**（=√((height−front_slope_bottom)²+(width−width_top)²)）でパネル割付・数量を計上すること。前面下部の垂直部（80mm）は別部材（桟木・カット材）として notes に記載。
- 底版が無い場合は base_width_mm / base_thickness_mm を書かない（0扱い）。

### 注意
- 妻面（CE1/CE2）の面積は六角形実面積で拾う（矩形 width×height から前面欠き分を控除）。
- 台形でも割付・セパ計算のルールは従来と同じ（面幅合計=width_mm、セパ本数式）。

---

## 追補v5（2026-07-25）: 地覆断面のpolygon指定と検証カード — 型知 v9

### 多角形断面（五角形以上）の書き方
台形（width_top_mm/front_slope_bottom_mm）で表現できない断面は `components.curb.polygon` に頂点 [x, y] を書く:
```json
"curb": {
  "polygon": [[0,0],[600,0],[600,513],[60,513],[0,80]],
  "length_mm": 33000
}
```
- **x=0 が CA（前面・外面）側**、y=0 が底面。図面が逆向きなら x を鏡像（x\' = 幅 − x）にして書く
- width_mm / height_mm は polygon の外形から自動で決まる（書かなくてよい）
- 反映範囲: 妻面（端部型枠）の実形状・端部枠線・断面図・妻面実面積の検算。CA/CB面パネルは従来どおり展開長基準の平面（割付・数量は正しい）
- 台形＋前面下部垂直の単純形は従来どおり width_top_mm / front_slope_bottom_mm 推奨（CA面の傾き表示が付く）

### 台形・多角形の検証カード（自動検算）
台形/polygon指定時、全体確認図の先頭に検証カードが出る:
- **CA斜辺長**の自動計算と、CA面 height_mm との検算（差5mm超で⚠）→ 前面パネルは斜辺長で拾うこと
- **前面下部垂直部**（80mm等）は別部材として拾う注記
- **妻面の実面積**（多角形の実面積。矩形からの控除量つき）→ 妻面型枠はこの面積で計上

### 登録のワンコマンド化
このフォルダに `.env.smd`（1行: `SUPABASE_SERVICE_ROLE_KEY=sb_secret_...`）を置けば、以後は `./register_md.sh` だけで登録できる。
