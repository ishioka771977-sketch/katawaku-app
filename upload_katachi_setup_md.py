# -*- coding: utf-8 -*-
"""
型知(katachi)セットアップmd 追記登録スクリプト。
既存の最新版 md_content 末尾に katachi_setup_md_addendum_v3.md を追記し、
smdUploadNewVersion (setup-md.js:103) と同一カラム・同一バージョニングで
新バージョンとして登録する。RLS(admin限定)を越えるため service_role が必要。

使い方:
    SUPABASE_SERVICE_ROLE_KEY='<実鍵>' python3 upload_katachi_setup_md.py

厳守:
  - service_role 鍵はこのファイルにも他のコードにも書かない（環境変数のみ）。
  - tetchi の既存行には一切触れない（app='katachi' のみ操作）。
"""
import os, sys
sys.stdout.reconfigure(encoding="utf-8")
from pathlib import Path
from supabase import create_client

URL = "https://koxovaejdkfkbcygriuu.supabase.co"
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
ADDENDUM_PATH = Path(__file__).parent / "katachi_setup_md_addendum_v3.md"
CHANGE_SUMMARY = (
    "3D対応範囲の早見表を追記（描ける形/描けない形/禁止事項/taper_face記法）。"
    "背景: 3Dエンジンの台形対応・橋台taper_face・床版3Dビュー追加に伴い、"
    "くろたんが『描けない形を出力しない』ためのガードを明文化。"
)

def main():
    if not KEY:
        print("ERROR: 環境変数 SUPABASE_SERVICE_ROLE_KEY が未設定")
        sys.exit(1)
    if not ADDENDUM_PATH.exists():
        print(f"ERROR: {ADDENDUM_PATH} が存在しません")
        sys.exit(1)

    addendum = ADDENDUM_PATH.read_text(encoding="utf-8")
    sb = create_client(URL, KEY)

    # 1) 既存最新版の取得（md本文＋バージョン採番の基準）
    ex = (sb.from_("setup_md_versions")
            .select("version_number, md_content")
            .eq("app", "katachi")
            .order("version_number", desc=True).limit(1).execute())
    if not ex.data:
        print("ERROR: katachi の既存 setup_md が見つからない（初版が無い状態への追記は想定外）")
        sys.exit(1)
    cur = ex.data[0]
    next_v = cur["version_number"] + 1
    print(f"[smd] current katachi v{cur['version_number']} ({len(cur['md_content'])}字) -> next v{next_v}")

    # 2) 追記済み本文の組み立て（冪等ガード: 同じ追記が既に入っていたら中止）
    marker = "【3D対応範囲｜JSONを書く前に必ず確認】"
    if marker in cur["md_content"]:
        print("ABORT: 既に追記済みの本文が最新版に含まれている。二重登録を回避して終了。")
        sys.exit(0)
    new_md = cur["md_content"].rstrip() + "\n\n---\n\n" + addendum.strip() + "\n"

    # 3) 登録（smdUploadNewVersion と同一カラム）
    res = sb.from_("setup_md_versions").insert({
        "app": "katachi",
        "version_number": next_v,
        "md_content": new_md,
        "change_summary": CHANGE_SUMMARY,
        "integrated_project_ids": [],
        "created_by": "hide",
    }).execute()
    row = res.data[0]
    print(f"[smd] 登録完了: katachi v{row['version_number']} ({len(new_md)}字) id={row['id']}")
    print("次: 型知の「セットアップmd取得」ボタンに NEW バッジが出ることを確認。")

if __name__ == "__main__":
    main()
