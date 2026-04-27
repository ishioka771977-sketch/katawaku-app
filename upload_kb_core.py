# -*- coding: utf-8 -*-
"""
型知 knowledge-base/core/ への初期ファイル一括アップロード。
くろたんから届いた .md / .pdf を Supabase Storage に投入する。

使い方:
    1) `knowledge-base/core/` にアップロードしたいファイルを配置
       （01_初期質問プロトコル.md, 02_型枠工事の正しい手順.md, ...）
    2) SUPABASE_SERVICE_ROLE_KEY を環境変数にセット
       （RLS を迂回するので service_role が必要）
    3) python upload_kb_core.py
"""
import os
import sys
import mimetypes
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

try:
    from supabase import create_client
except ImportError:
    print("pip install supabase")
    sys.exit(1)

SUPABASE_URL = "https://koxovaejdkfkbcygriuu.supabase.co"
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
BUCKET = "knowledge-base"

# 想定ファイル一覧（くろたん指示書準拠）
# Supabase Storage は key に日本語不可。英数字スラッグで運用。
# 日本語タイトルはファイル本文の先頭（H1）に書く。
EXPECTED = [
    "01_initial_questions.md",   # 初期質問プロトコル
    "02_correct_procedure.md",   # 型枠工事の正しい手順
    "03_plan_writing.md",        # 施工計画書作成の要諦
    "04_cost_principles.md",     # 原価管理の原則
    "05_slab_knowhow.md",        # 床版型枠の知見
    "06_parapet_knowhow.md",     # 地覆壁高欄の知見
    "07_wall_knowhow.md",        # 擁壁型枠の知見
    "08_veteran_glossary.md",    # ベテラン表現変換辞書
    "09_abutment_knowhow.md",    # 橋台型枠の知見
    "10_joint_design.md",        # 誘発目地への設計変更例
]

def main():
    if not SUPABASE_KEY:
        print("ERROR: 環境変数 SUPABASE_SERVICE_ROLE_KEY が未設定")
        print("Supabase Dashboard → Settings → API → service_role を取得")
        sys.exit(1)

    src_dir = Path(__file__).parent / "knowledge-base" / "core"
    if not src_dir.exists():
        print(f"ERROR: {src_dir} が存在しません")
        print("このフォルダにくろたんから届いたファイルを置いてから再実行してください")
        sys.exit(1)

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    files = sorted(src_dir.iterdir())
    for p in files:
        if not p.is_file():
            continue
        dest = f"core/{p.name}"
        mime = mimetypes.guess_type(p.name)[0] or "text/markdown; charset=utf-8"
        if p.suffix.lower() == ".md":
            mime = "text/markdown; charset=utf-8"
        with open(p, "rb") as f:
            data = f.read()
        try:
            sb.storage.from_(BUCKET).upload(
                dest, data,
                file_options={"content-type": mime, "upsert": "true"},
            )
            flag = "✓" if p.name in EXPECTED else "+"
            print(f"{flag} uploaded: {dest}  ({len(data)} bytes)")
        except Exception as e:
            print(f"✗ failed: {dest} — {e}")

    # 想定ファイルのうち未アップロードのものを警告
    uploaded = {p.name for p in files if p.is_file()}
    missing = [n for n in EXPECTED if n not in uploaded]
    if missing:
        print("\n⚠ 未配置ファイル:")
        for n in missing:
            print(f"   - {n}")

if __name__ == "__main__":
    main()
