#!/bin/bash
# Versio 開発サーバー起動スクリプト

cd "$(dirname "$0")"

echo "=== Versio 起動中 ==="
echo "アクセス: http://localhost:5173"
exec npm run dev
