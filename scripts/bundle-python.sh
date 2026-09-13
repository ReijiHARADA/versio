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
VERSION_FILE="$SERVER_DIR/.python-version"

# Patch-level pin for clean, reproducible release builds (not just 3.12).
PYTHON_VERSION="$(tr -d '[:space:]' < "$VERSION_FILE" 2>/dev/null || true)"
if [[ -z "$PYTHON_VERSION" ]]; then
  PYTHON_VERSION="3.12.14"
fi
if [[ ! "$PYTHON_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "エラー: $VERSION_FILE は patch まで固定してください（例: 3.12.14）。現在: '$PYTHON_VERSION'"
  exit 1
fi

echo "=== Reproducible Python runtime ==="
echo "Server:  $SERVER_DIR"
echo "Dest:    $DEST_DIR"
echo "Python:  $PYTHON_VERSION"

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

if ! command -v uv >/dev/null 2>&1; then
  echo "エラー: 再現可能なビルドには uv が必要です。"
  exit 1
fi

uv python install "$PYTHON_VERSION"
uv venv --python "$PYTHON_VERSION" "$DEST_DIR"
# shellcheck disable=SC1091
source "$DEST_DIR/bin/activate"
ACTUAL_VERSION="$(python -c 'import sys; print(".".join(map(str, sys.version_info[:3])))')"
if [[ "$ACTUAL_VERSION" != "$PYTHON_VERSION" ]]; then
  echo "エラー: 期待 Python $PYTHON_VERSION ですが実際は $ACTUAL_VERSION です"
  deactivate || true
  exit 1
fi
uv pip install -r "$LOCK_FILE"
deactivate || true

# Trim caches
find "$DEST_DIR" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find "$DEST_DIR" -name "*.pyc" -delete 2>/dev/null || true
find "$DEST_DIR" -name "*.pyo" -delete 2>/dev/null || true

echo "✓ Clean venv ready: $(du -sh "$DEST_DIR" | cut -f1)"
echo "  Python: $PYTHON_VERSION"
echo "  Lock: $LOCK_FILE"
