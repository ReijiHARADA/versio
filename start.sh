#!/bin/bash
# Versio 一括起動スクリプト

# スクリプトのディレクトリに移動
cd "$(dirname "$0")"

echo "=== Versio 起動中 ==="
echo ""

# Ollama起動
echo "1. Ollamaを起動中..."
ollama serve &
OLLAMA_PID=$!
echo "   ✓ Ollama起動 (PID: $OLLAMA_PID)"
sleep 2

# アプリ起動
echo "2. アプリを起動中..."
npm run dev &
APP_PID=$!
echo "   ✓ アプリ起動 (PID: $APP_PID)"
echo ""

echo "=== 起動完了 ==="
echo ""
echo "アクセス: http://localhost:5173"
echo ""
echo "プロセスID:"
echo "  - Ollama: $OLLAMA_PID"
echo "  - アプリ: $APP_PID"
echo ""
echo "終了する場合:"
echo "  kill $OLLAMA_PID $APP_PID"
echo ""
echo "または Ctrl+C で全プロセスを終了"
echo ""

# Ctrl+Cで全プロセス終了
trap "echo ''; echo '終了中...'; kill $OLLAMA_PID $APP_PID 2>/dev/null; exit" EXIT INT TERM

# 待機
wait
