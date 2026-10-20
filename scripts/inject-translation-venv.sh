#!/bin/bash
# Inject the staged Python venv into a packaged .app after Tauri bundling.
# Uses APFS clonefile when available so warm rebuilds avoid a full ~700MB copy.
#
# Usage:
#   bash scripts/inject-translation-venv.sh [path-to-Paper-Reader.app]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_PATH="${1:-$PROJECT_DIR/src-tauri/target/release/bundle/macos/Paper Reader.app}"
VENV_STAGE="$PROJECT_DIR/src-tauri/bundled-resources/translation-venv"
APP_SERVER="$APP_PATH/Contents/Resources/translation-server"
APP_VENV="$APP_SERVER/venv"

clone_or_copy_dir() {
  local src="$1"
  local dst="$2"
  # Prefer a single APFS clonefile of the directory tree (near-instant).
  if cp -cR "$src" "$dst" 2>/dev/null; then
    return 0
  fi
  mkdir -p "$dst"
  if cp -cR "$src"/. "$dst"/ 2>/dev/null; then
    return 0
  fi
  rsync -a "$src"/ "$dst"/
}

if [[ ! -d "$APP_PATH" ]]; then
  echo "エラー: .app がありません: $APP_PATH"
  exit 1
fi
if [[ ! -f "$APP_SERVER/server.py" ]]; then
  echo "エラー: .app に translation-server lite がありません: $APP_SERVER"
  exit 1
fi
if [[ ! -x "$VENV_STAGE/bin/python3" ]]; then
  echo "エラー: staged venv がありません。先に stage-translation-bundle.sh を実行してください。"
  exit 1
fi

STAGE_HASH=""
if [[ -f "$VENV_STAGE/.paper-reader-bundle-hash" ]]; then
  STAGE_HASH="$(tr -d '[:space:]' <"$VENV_STAGE/.paper-reader-bundle-hash")"
fi
APP_HASH=""
if [[ -f "$APP_VENV/.paper-reader-bundle-hash" ]]; then
  APP_HASH="$(tr -d '[:space:]' <"$APP_VENV/.paper-reader-bundle-hash")"
fi

if [[ -x "$APP_VENV/bin/python3" && -n "$STAGE_HASH" && "$APP_HASH" == "$STAGE_HASH" ]]; then
  echo "✓ App venv already matches staged hash ($STAGE_HASH) — skip inject"
  exit 0
fi

echo "=== Inject translation venv into .app ==="
echo "From: $VENV_STAGE"
echo "To:   $APP_VENV"

t0="$(python3 -c 'import time; print(int(time.time() * 1000))')"
TMP_VENV="${APP_VENV}.tmp.$$"
rm -rf "$TMP_VENV" "$APP_VENV"
clone_or_copy_dir "$VENV_STAGE" "$TMP_VENV"
mv "$TMP_VENV" "$APP_VENV"

if [[ ! -x "$APP_VENV/bin/python3" ]]; then
  echo "エラー: inject 後の venv が不完全です"
  exit 1
fi

# Keep lite provenance stamps aligned with the injected venv.
if [[ -n "$STAGE_HASH" ]]; then
  printf '%s\n' "$STAGE_HASH" >"$APP_SERVER/.paper-reader-bundle-hash"
fi

elapsed="$(python3 -c "import time; print(f'{(int(time.time() * 1000) - $t0) / 1000:.1f}')")"
SIZE="$(du -sh "$APP_VENV" | cut -f1)"
echo "✓ Injected venv ($SIZE) in ${elapsed}s"
if [[ -n "${PAPER_READER_BUILD_TIMINGS:-}" ]]; then
  echo "venv_inject_s=$elapsed" >>"$PAPER_READER_BUILD_TIMINGS"
fi
