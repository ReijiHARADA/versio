#!/bin/bash
# Build a clean, reproducible Python runtime for the Tauri release bundle.
# Does NOT copy a developer .venv — installs from a lockfile into translation-server/venv.
#
# Modes (VERSIO_PYTHON_BUNDLE_MODE or first arg):
#   cache (default) — reuse venv when content-hash + validation pass
#   clean           — always wipe and rebuild from lock + pinned Python
#
# Usage:
#   bash scripts/bundle-python.sh
#   bash scripts/bundle-python.sh clean
#   VERSIO_PYTHON_BUNDLE_MODE=clean bash scripts/bundle-python.sh

set -euo pipefail

SCRIPT_PATH="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVER_DIR="$PROJECT_DIR/translation-server"
DEST_DIR="$SERVER_DIR/venv"
REQ_TXT="$SERVER_DIR/requirements.txt"
LOCK_FILE="$SERVER_DIR/requirements.lock"
VERSION_FILE="$SERVER_DIR/.python-version"
HASH_STAMP="$DEST_DIR/.versio-bundle-hash"
# Bump when install/trim/validation semantics change independently of file bytes.
BUNDLE_SCRIPT_VERSION="3"

MODE="${VERSIO_PYTHON_BUNDLE_MODE:-cache}"
CHECK_ONLY=0
for arg in "$@"; do
  case "$arg" in
    clean|--clean) MODE="clean" ;;
    cache|--cache) MODE="cache" ;;
    --check-only) CHECK_ONLY=1 ;;
    *)
      echo "エラー: 不明な引数 '$arg'（cache|clean|--check-only）"
      exit 1
      ;;
  esac
done

# Patch-level pin for clean, reproducible release builds (not just 3.12).
PYTHON_VERSION="$(tr -d '[:space:]' < "$VERSION_FILE" 2>/dev/null || true)"
if [[ -z "$PYTHON_VERSION" ]]; then
  PYTHON_VERSION="3.12.14"
fi
if [[ ! "$PYTHON_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "エラー: $VERSION_FILE は patch まで固定してください（例: 3.12.14）。現在: '$PYTHON_VERSION'"
  exit 1
fi

sha256_file() {
  local f="$1"
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$f" | awk '{print $1}'
  else
    sha256sum "$f" | awk '{print $1}'
  fi
}

sha256_stdin() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 | awk '{print $1}'
  else
    sha256sum | awk '{print $1}'
  fi
}

compute_content_hash() {
  if [[ ! -f "$LOCK_FILE" ]]; then
    echo ""
    return 0
  fi
  {
    echo "bundle-script-version:${BUNDLE_SCRIPT_VERSION}"
    echo "script-sha256:$(sha256_file "$SCRIPT_PATH")"
    echo "python-version:$(tr -d '[:space:]' < "$VERSION_FILE")"
    echo "lock-sha256:$(sha256_file "$LOCK_FILE")"
    # Lock body is also hashed so lock edits always invalidate even if path tricks occur.
    cat "$LOCK_FILE"
  } | sha256_stdin
}

trim_venv() {
  local root="$1"
  find "$root" -type d -name "__pycache__" -prune -exec rm -rf {} + 2>/dev/null || true
  find "$root" -type f \( -name "*.pyc" -o -name "*.pyo" \) -delete 2>/dev/null || true
  # Package test suites only (do NOT remove torch.testing — it is a public module).
  find "$root/lib" -type d -name "tests" -prune -exec rm -rf {} + 2>/dev/null || true
  find "$root" -type d -name "man" -path "*/share/man" -prune -exec rm -rf {} + 2>/dev/null || true
  find "$root" -type d -name "*.dist-info" -exec sh -c '
    for d in "$@"; do
      rm -f "$d"/RECORD "$d"/REQUESTED "$d"/INSTALLER 2>/dev/null || true
    done
  ' _ {} + 2>/dev/null || true
}

validate_venv() {
  local expected_hash="$1"
  local expected_py="$2"

  if [[ ! -x "$DEST_DIR/bin/python3" ]]; then
    echo "validation: missing $DEST_DIR/bin/python3"
    return 1
  fi
  if [[ ! -f "$DEST_DIR/pyvenv.cfg" ]]; then
    echo "validation: missing pyvenv.cfg"
    return 1
  fi
  if [[ ! -f "$HASH_STAMP" ]]; then
    echo "validation: missing hash stamp"
    return 1
  fi
  local stamped
  stamped="$(tr -d '[:space:]' < "$HASH_STAMP")"
  if [[ "$stamped" != "$expected_hash" ]]; then
    echo "validation: hash mismatch (stamp=$stamped expected=$expected_hash)"
    return 1
  fi

  local actual
  actual="$("$DEST_DIR/bin/python3" -c 'import sys; print(".".join(map(str, sys.version_info[:3])))')"
  if [[ "$actual" != "$expected_py" ]]; then
    echo "validation: Python $actual != expected $expected_py"
    return 1
  fi

  # Runtime imports used by the packaged translation server.
  if ! "$DEST_DIR/bin/python3" -c \
    'import fastapi, uvicorn, pydantic, torch, transformers, sentencepiece, accelerate' \
    >/dev/null 2>&1; then
    echo "validation: required packages failed to import"
    return 1
  fi
  return 0
}

write_stamp() {
  local hash="$1"
  printf '%s\n' "$hash" >"$HASH_STAMP"
}

echo "=== Reproducible Python runtime ($MODE) ==="
echo "Server:  $SERVER_DIR"
echo "Dest:    $DEST_DIR"
echo "Python:  $PYTHON_VERSION"

if [[ ! -f "$REQ_TXT" ]]; then
  echo "エラー: $REQ_TXT がありません"
  exit 1
fi

if [[ ! -f "$LOCK_FILE" ]]; then
  echo "requirements.lock が無いので生成します…"
  if command -v uv >/dev/null 2>&1; then
    (cd "$SERVER_DIR" && uv pip compile "$REQ_TXT" -o requirements.lock)
  else
    echo "エラー: uv が必要です。brew install uv のあと再実行してください。"
    exit 1
  fi
fi

if ! command -v uv >/dev/null 2>&1; then
  echo "エラー: 再現可能なビルドには uv が必要です。"
  exit 1
fi

EXPECTED_HASH="$(compute_content_hash)"
echo "Content-hash: $EXPECTED_HASH"

if [[ "$CHECK_ONLY" == "1" ]]; then
  if [[ "$MODE" == "clean" ]]; then
    echo "check-only: clean mode always rebuilds"
    exit 1
  fi
  if validate_venv "$EXPECTED_HASH" "$PYTHON_VERSION"; then
    echo "check-only: cache valid"
    exit 0
  fi
  echo "check-only: cache invalid"
  exit 1
fi

if [[ "$MODE" != "clean" ]]; then
  if validate_venv "$EXPECTED_HASH" "$PYTHON_VERSION"; then
    SIZE="$(du -sh "$DEST_DIR" | cut -f1)"
    echo "✓ Reusing cached venv ($SIZE) — hash unchanged"
    echo "VERSIO_PYTHON_REBUILT=0"
    exit 0
  fi
  echo "Cache miss or invalid venv — rebuilding…"
fi

rm -rf "$DEST_DIR"

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

trim_venv "$DEST_DIR"
write_stamp "$EXPECTED_HASH"

if ! validate_venv "$EXPECTED_HASH" "$PYTHON_VERSION"; then
  echo "エラー: 再構築後の venv validation に失敗しました"
  exit 1
fi

echo "✓ Clean venv ready: $(du -sh "$DEST_DIR" | cut -f1)"
echo "  Python: $PYTHON_VERSION"
echo "  Lock: $LOCK_FILE"
echo "  Hash: $EXPECTED_HASH"
echo "VERSIO_PYTHON_REBUILT=1"
