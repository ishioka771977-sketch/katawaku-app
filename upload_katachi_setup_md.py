# -*- coding: utf-8 -*-
"""
型知(katachi)セットアップmd 追記登録スクリプト。
既存の最新版 md_content 末尾に katachi_setup_md_addendum_v5.md を追記し、
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
def _load_key():
    k = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip().strip("'\"")
    if k:
        return k
    envf = Path(__file__).parent / ".env.smd"
    if envf.exists():
        for line in envf.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
                return line.split("=", 1)[1].strip().strip("'\"")
    return ""

KEY = _load_key()
ADDENDUM_PATH = Path(__file__).parent / "katachi_setup_md_addendum_v5.md"
CHANGE_SUMMARY = (
    "追補v5: 地覆断面のpolygon指定（多角形・x=0がCA前面側）と台形検証カード（CA斜辺長・妻面実面積の自動検算）"
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

    # 2) 追記済み本文の組み立て（冪等ガード: 今回の追補が既に入っていたら中止）
    # マーカーは「今回の追補ファイルの見出し」から取る（過去追補の文字列を使うと常にABORTする事故になる）
    marker = addendum.strip().splitlines()[0].strip()
    if marker and marker in cur["md_content"]:
        print(f"ABORT: 今回の追補（{marker}）は既に最新版に含まれている。二重登録を回避して終了。")
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
