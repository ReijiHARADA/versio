#!/bin/bash
# MADLAD翻訳サーバー再起動スクリプト

cd "$(dirname "$0")/translation-server"

# 既存のプロセスを停止。`[p]ython` はこのスクリプト自身の
# コマンドラインにある検索文字列へ pkill が一致するのを防ぐ。
echo "既存のサーバーを停止中..."
pkill -f '[p]ython.*server\.py' || true
sleep 2

if [[ "${1:-}" == "stop" ]]; then
  echo "サーバーを停止しました。"
  exit 0
fi

# 仮想環境を有効化
source .venv/bin/activate

# MPS 未対応演算は CPU へフォールバック（クラッシュ回避）
export PYTORCH_ENABLE_MPS_FALLBACK=1

# サーバーを起動
echo "サーバーを起動中..."
python server.py
