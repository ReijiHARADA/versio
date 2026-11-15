#!/bin/bash
# Stage a minimal translation-server tree for Tauri resources.
# Excludes developer venvs, local model weights, tests, and bench artifacts so
# they cannot contaminate the packaged .app.
#
# Layout:
#   src-tauri/bundled-resources/translation-server/  — lite (no venv); Tauri copies this
#   src-tauri/bundled-resources/translation-venv/    — Python venv; injected after bundle
#     via scripts/inject-translation-venv.sh (APFS clonefile when possible)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVER_DIR="$PROJECT_DIR/translation-server"
VENV_DIR="$SERVER_DIR/venv"
STAGE_ROOT="$PROJECT_DIR/src-tauri/bundled-resources/translation-server"
VENV_STAGE="$PROJECT_DIR/src-tauri/bundled-resources/translation-venv"
MODE="${VERSIO_PYTHON_BUNDLE_MODE:-cache}"

if [[ ! -x "$VENV_DIR/bin/python3" ]]; then
  echo "エラー: $VENV_DIR がありません。先に scripts/bundle-python.sh を実行してください。"
  exit 1
fi

HASH_STAMP="$VENV_DIR/.versio-bundle-hash"
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
echo "Venv:   $VENV_STAGE"
echo "Mode:   $MODE"

VENV_HASH_FILE="$VENV_STAGE/.versio-bundle-hash"
REUSE_VENV=0
if [[ -x "$VENV_STAGE/bin/python3" && -f "$VENV_HASH_FILE" ]]; then
  staged_hash="$(tr -d '[:space:]' < "$VENV_HASH_FILE")"
  if [[ "$staged_hash" == "$CONTENT_HASH" ]]; then
    REUSE_VENV=1
  fi
fi

# Refresh lite payload every time (server/engines change often). No venv here —
# Tauri would otherwise re-copy ~700MB into .app on every bundle.
TMP_STAGE="${STAGE_ROOT}.tmp.$$"
rm -rf "$TMP_STAGE"
mkdir -p "$TMP_STAGE/engines"

cp "$SERVER_DIR/server.py" "$TMP_STAGE/server.py"
cp "$SERVER_DIR/.python-version" "$TMP_STAGE/.python-version"
cp "$SERVER_DIR/requirements.lock" "$TMP_STAGE/requirements.lock"
cp "$SERVER_DIR/requirements.txt" "$TMP_STAGE/requirements.txt"

rsync -a --delete \
  --exclude '__pycache__/' \
  --exclude '*.pyc' \
  --exclude '*.pyo' \
  "$SERVER_DIR/engines/" "$TMP_STAGE/engines/"

printf '%s\n' "$CONTENT_HASH" >"$TMP_STAGE/.versio-bundle-hash"
printf '%s\n' "$MODE" >"$TMP_STAGE/.versio-bundle-mode"
printf '%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$TMP_STAGE/.versio-bundled-at"
# Marker so finalize/verify know the venv is injected after Tauri bundle.
printf 'external\n' >"$TMP_STAGE/.versio-venv-external"

rm -rf "$STAGE_ROOT"
mv "$TMP_STAGE" "$STAGE_ROOT"

if [[ "$REUSE_VENV" == "1" ]]; then
  echo "Reusing staged venv (hash unchanged)"
else
  echo "Refreshing staged venv…"
  TMP_VENV="${VENV_STAGE}.tmp.$$"
  rm -rf "$TMP_VENV"
  mkdir -p "$TMP_VENV"
  copy_tree "$VENV_DIR" "$TMP_VENV"
  printf '%s\n' "$CONTENT_HASH" >"$TMP_VENV/.versio-bundle-hash"
  rm -rf "$VENV_STAGE"
  mv "$TMP_VENV" "$VENV_STAGE"
fi

# Belt-and-suspenders: never ship accidental nested junk in the lite stage
rm -rf \
  "$STAGE_ROOT/venv" \
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

if [[ ! -f "$STAGE_ROOT/server.py" ]]; then
  echo "エラー: staged lite bundle が不完全です"
  exit 1
fi
if [[ ! -x "$VENV_STAGE/bin/python3" ]]; then
  echo "エラー: staged venv が不完全です"
  exit 1
fi

for bad in .venv .venv-mlx .venv-mlx-bf16 .venv.backup.py39 models venv; do
  if [[ -e "$STAGE_ROOT/$bad" ]]; then
    echo "エラー: staged lite bundle に禁止パスが残っています: $bad"
    exit 1
  fi
done

LITE_SIZE="$(du -sh "$STAGE_ROOT" | cut -f1)"
VENV_SIZE="$(du -sh "$VENV_STAGE" | cut -f1)"
echo "✓ Staged translation-server lite ($LITE_SIZE) + venv ($VENV_SIZE)"
echo "  hash=$CONTENT_HASH mode=$MODE reuse_venv=$REUSE_VENV"
