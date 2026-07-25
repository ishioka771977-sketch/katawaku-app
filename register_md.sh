#!/bin/sh
# セットアップmd登録（鍵は .env.smd から自動読込）
cd "$(dirname "$0")" && python3 upload_katachi_setup_md.py
