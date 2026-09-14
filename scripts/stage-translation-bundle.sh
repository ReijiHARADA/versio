#!/bin/bash
# Stage a minimal translation-server tree for Tauri resources.
# Excludes developer venvs, local model weights, tests, and bench artifacts so
# they cannot contaminate the packaged .app.
#
# Output: src-tauri/bundled-resources/translation-server/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVER_DIR="$PROJECT_DIR/translation-server"
VENV_DIR="$SERVER_DIR/venv"
STAGE_ROOT="$PROJECT_DIR/src-tauri/bundled-resources/translation-server"
MODE="${PAPER_READER_PYTHON_BUNDLE_MODE:-cache}"

if [[ ! -x "$VENV_DIR/bin/python3" ]]; then
  echo "エラー: $VENV_DIR がありません。先に scripts/bundle-python.sh を実行してください。"
  exit 1
fi

HASH_STAMP="$VENV_DIR/.paper-reader-bundle-hash"
if [[ ! -f "$HASH_STAMP" ]]; then
  echo "エラー: venv hash stamp がありません。bundle-python.sh を再実行してください。"
  exit 1
fi
CONTENT_HASH="$(tr -d '[:space:]' < "$HASH_STAMP")"

copy_tree() {
  local src="$1"
  local dst="$2"
  mkdir -p "$dst"
  # APFS clonefile when available (fast); fall back to rsync.
  if cp -cR "$src"/. "$dst"/ 2>/dev/null; then
    return 0
  fi
  rsync -a "$src"/ "$dst"/
}

echo "=== Stage translation-server for Tauri bundle ==="
echo "Source: $SERVER_DIR"
echo "Stage:  $STAGE_ROOT"
echo "Mode:   $MODE"

STAGE_HASH_FILE="$STAGE_ROOT/.paper-reader-bundle-hash"
REUSE_VENV=0
if [[ -x "$STAGE_ROOT/venv/bin/python3" && -f "$STAGE_HASH_FILE" ]]; then
  staged_hash="$(tr -d '[:space:]' < "$STAGE_HASH_FILE")"
  if [[ "$staged_hash" == "$CONTENT_HASH" ]]; then
    REUSE_VENV=1
  fi
fi

# Refresh non-venv payload every time (server/engines change often).
TMP_STAGE="${STAGE_ROOT}.tmp.$$"
rm -rf "$TMP_STAGE"
mkdir -p "$TMP_STAGE/engines"

cp "$SERVER_DIR/server.py" "$TMP_STAGE/server.py"
cp "$SERVER_DIR/.python-version" "$TMP_STAGE/.python-version"
cp "$SERVER_DIR/requirements.lock" "$TMP_STAGE/requirements.lock"
cp "$SERVER_DIR/requirements.txt" "$TMP_STAGE/requirements.txt"

# engines package; no __pycache__
rsync -a --delete \
  --exclude '__pycache__/' \
  --exclude '*.pyc' \
  --exclude '*.pyo' \
  "$SERVER_DIR/engines/" "$TMP_STAGE/engines/"

if [[ "$REUSE_VENV" == "1" ]]; then
  echo "Reusing staged venv (hash unchanged)"
  mv "$STAGE_ROOT/venv" "$TMP_STAGE/venv"
else
  copy_tree "$VENV_DIR" "$TMP_STAGE/venv"
fi

# Provenance markers (release acceptance can inspect these)
printf '%s\n' "$CONTENT_HASH" >"$TMP_STAGE/.paper-reader-bundle-hash"
printf '%s\n' "$MODE" >"$TMP_STAGE/.paper-reader-bundle-mode"
printf '%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$TMP_STAGE/.paper-reader-bundled-at"

rm -rf "$STAGE_ROOT"
mv "$TMP_STAGE" "$STAGE_ROOT"

# Belt-and-suspenders: never ship accidental nested junk
rm -rf \
  "$STAGE_ROOT/models" \
  "$STAGE_ROOT/.venv" \
  "$STAGE_ROOT/.venv-mlx" \
  "$STAGE_ROOT/.venv-mlx-bf16" \
  "$STAGE_ROOT/.venv.backup.py39" \
  "$STAGE_ROOT/tests" \
  "$STAGE_ROOT/benchmarks" \
  "$STAGE_ROOT/scripts" \
  "$STAGE_ROOT/__pycache__" \
  2>/dev/null || true

if [[ ! -x "$STAGE_ROOT/venv/bin/python3" ]]; then
  echo "エラー: staged venv が不完全です"
  exit 1
fi

# Fail closed if a developer venv leaked into the stage root
for bad in .venv .venv-mlx .venv-mlx-bf16 .venv.backup.py39 models; do
  if [[ -e "$STAGE_ROOT/$bad" ]]; then
    echo "エラー: staged bundle に禁止パスが残っています: $bad"
    exit 1
  fi
done

SIZE="$(du -sh "$STAGE_ROOT" | cut -f1)"
echo "✓ Staged translation-server ($SIZE)"
echo "  hash=$CONTENT_HASH mode=$MODE reuse_venv=$REUSE_VENV"
