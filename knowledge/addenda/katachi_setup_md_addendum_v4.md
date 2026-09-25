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
