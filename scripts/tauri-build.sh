#!/bin/bash
# Packaged Tauri build with fast (daily) vs clean (release) modes + phase timings.
#
#   bash scripts/tauri-build.sh fast   # cached Python, .app only
#   bash scripts/tauri-build.sh clean  # clean Python, .app + .dmg
#
# Env:
#   DEVELOPER_DIR — defaults to Xcode-beta when present

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TIMING_FILE="$PROJECT_DIR/.build-timings"
MODE="${1:-fast}"

case "$MODE" in
  fast|clean) ;;
  *)
    echo "Usage: $0 {fast|clean}"
    exit 1
    ;;
esac

cd "$PROJECT_DIR"

if [[ -z "${DEVELOPER_DIR:-}" ]]; then
  if [[ -d /Applications/Xcode-beta.app/Contents/Developer ]]; then
    export DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer
  fi
fi

export PATH="${HOME}/.cargo/bin:/opt/homebrew/bin:${PATH}"
# shellcheck disable=SC1091
source "${HOME}/.cargo/env" 2>/dev/null || true

export PAPER_READER_BUILD_TIMINGS="$TIMING_FILE"
if [[ "$MODE" == "clean" ]]; then
  export PAPER_READER_PYTHON_BUNDLE_MODE="clean"
  PYTHON_ARG="clean"
  BUNDLES=(app dmg)
else
  export PAPER_READER_PYTHON_BUNDLE_MODE="cache"
  PYTHON_ARG="cache"
  BUNDLES=(app)
fi

now_ms() {
  python3 -c 'import time; print(int(time.time() * 1000))'
}

elapsed_s() {
  local start="$1"
  local end
  end="$(now_ms)"
  python3 -c "print(f'{($end - $start) / 1000:.1f}')"
}

read_timing() {
  local key="$1"
  if [[ -f "$TIMING_FILE" ]] && grep -q "^${key}=" "$TIMING_FILE"; then
    grep "^${key}=" "$TIMING_FILE" | tail -1 | cut -d= -f2
  else
    echo "n/a"
  fi
}

echo "=========================================="
echo " Paper Reader tauri build ($MODE)"
echo " bundles: ${BUNDLES[*]}"
echo " DEVELOPER_DIR=${DEVELOPER_DIR:-'(unset)'}"
echo "=========================================="

WALL0="$(now_ms)"
: >"$TIMING_FILE"

# Run prepare phases ourselves so we can time them; skip Tauri's beforeBuildCommand body.
t0="$(now_ms)"
bash "$SCRIPT_DIR/bundle-python.sh" "$PYTHON_ARG"
python_s="$(elapsed_s "$t0")"
echo "python_prep_s=$python_s" >>"$TIMING_FILE"
echo "⏱  Python runtime: ${python_s}s"

t0="$(now_ms)"
bash "$SCRIPT_DIR/stage-translation-bundle.sh"
stage_s="$(elapsed_s "$t0")"
echo "stage_s=$stage_s" >>"$TIMING_FILE"
echo "⏱  Stage resources: ${stage_s}s"

t0="$(now_ms)"
npm run build
frontend_s="$(elapsed_s "$t0")"
echo "frontend_s=$frontend_s" >>"$TIMING_FILE"
echo "⏱  Frontend build: ${frontend_s}s"

export PAPER_READER_SKIP_BEFORE_BUILD=1

t0="$(now_ms)"
npx tauri build --no-bundle --ci
rust_s="$(elapsed_s "$t0")"
echo "rust_s=$rust_s" >>"$TIMING_FILE"
echo "⏱  Rust compile: ${rust_s}s"

# Bundle .app (and optionally leave dmg for a separate timed step).
t0="$(now_ms)"
npx tauri build --bundles app --ci
app_bundle_s="$(elapsed_s "$t0")"
echo "app_bundle_s=$app_bundle_s" >>"$TIMING_FILE"
echo "⏱  Tauri .app bundle: ${app_bundle_s}s"

dmg_s="0.0"
if [[ "$MODE" == "clean" ]]; then
  t0="$(now_ms)"
  npx tauri build --bundles dmg --ci
  dmg_s="$(elapsed_s "$t0")"
  echo "dmg_s=$dmg_s" >>"$TIMING_FILE"
  echo "⏱  DMG generation: ${dmg_s}s"
else
  echo "dmg_s=skipped" >>"$TIMING_FILE"
  echo "⏱  DMG generation: skipped (fast mode)"
fi

wall_s="$(elapsed_s "$WALL0")"
echo "wall_s=$wall_s" >>"$TIMING_FILE"

APP_PATH="src-tauri/target/release/bundle/macos/Paper Reader.app"
STAGE_MODE_FILE="src-tauri/bundled-resources/translation-server/.paper-reader-bundle-mode"
if [[ -f "$STAGE_MODE_FILE" ]]; then
  STAGED_MODE="$(tr -d '[:space:]' < "$STAGE_MODE_FILE")"
else
  STAGED_MODE="unknown"
fi

# Guard: clean release must not ship a cache-mode marker.
if [[ "$MODE" == "clean" && "$STAGED_MODE" != "clean" ]]; then
  echo "エラー: clean build なのに staged mode=$STAGED_MODE"
  exit 1
fi

echo
echo "========== Build timings ($MODE) =========="
printf "  Python runtime prep : %ss\n" "$(read_timing python_prep_s)"
printf "  Stage resources     : %ss\n" "$(read_timing stage_s)"
printf "  Frontend build      : %ss\n" "$(read_timing frontend_s)"
printf "  Rust compile        : %ss\n" "$(read_timing rust_s)"
printf "  Tauri .app bundle   : %ss\n" "$(read_timing app_bundle_s)"
printf "  DMG generation      : %s\n" "$(read_timing dmg_s)"
printf "  Wall clock          : %ss\n" "$wall_s"
echo "==========================================="
echo "✓ .app: $APP_PATH"
if [[ "$MODE" == "clean" ]]; then
  echo "✓ .dmg: src-tauri/target/release/bundle/dmg/Paper Reader_0.1.0_aarch64.dmg"
fi
echo "  staged python mode: $STAGED_MODE"
echo "  timings file: $TIMING_FILE"
