#!/bin/bash
# Build a clean, reproducible Python runtime for the Tauri release bundle.
# Does NOT copy a developer .venv — installs from a lockfile into translation-server/venv.
#
# Usage: called from tauri beforeBuildCommand, or manually before release.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVER_DIR="$PROJECT_DIR/translation-server"
DEST_DIR="$SERVER_DIR/venv"
REQ_TXT="$SERVER_DIR/requirements.txt"
LOCK_FILE="$SERVER_DIR/requirements.lock"

echo "=== Reproducible Python runtime ==="
echo "Server: $SERVER_DIR"
echo "Dest:   $DEST_DIR"

if [ ! -f "$REQ_TXT" ]; then
  echo "エラー: $REQ_TXT がありません"
  exit 1
fi

# Ensure lockfile exists (generate when missing or when regenerating intentionally).
if [ ! -f "$LOCK_FILE" ]; then
  echo "requirements.lock が無いので生成します…"
  if command -v uv >/dev/null 2>&1; then
    (cd "$SERVER_DIR" && uv pip compile "$REQ_TXT" -o requirements.lock)
  else
    echo "エラー: uv が必要です。brew install uv のあと再実行してください。"
    exit 1
  fi
fi

rm -rf "$DEST_DIR"

PYTHON_BIN=""
if command -v uv >/dev/null 2>&1; then
  # Prefer an explicit 3.12 toolchain for MPS builds.
  uv python install 3.12 >/dev/null 2>&1 || true
  uv venv --python 3.12 "$DEST_DIR"
  # shellcheck disable=SC1091
  source "$DEST_DIR/bin/activate"
  uv pip install -r "$LOCK_FILE"
  deactivate || true
else
  echo "エラー: 再現可能なビルドには uv が必要です。"
  exit 1
fi

# Trim caches
find "$DEST_DIR" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find "$DEST_DIR" -name "*.pyc" -delete 2>/dev/null || true
find "$DEST_DIR" -name "*.pyo" -delete 2>/dev/null || true

echo "✓ Clean venv ready: $(du -sh "$DEST_DIR" | cut -f1)"
echo "  Lock: $LOCK_FILE"
