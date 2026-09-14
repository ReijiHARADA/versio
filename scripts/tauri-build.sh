#!/bin/bash
# Packaged Tauri build with fast (daily) vs clean (release) modes + phase timings.
#
#   bash scripts/tauri-build.sh fast   # cached Python, .app only (never signed)
#   bash scripts/tauri-build.sh clean  # clean Python, .app then DMG
#
# Clean + signing (optional):
#   PAPER_READER_SIGN=1 bash scripts/tauri-build.sh clean
#     → build unsigned .app
#     → sign/notarize/staple .app
#     → build DMG from signed .app
#     → sign/notarize/staple DMG
#
# Clean without credentials:
#   → build unsigned .app
#   → build unsigned DMG from that .app
#   (explicitly NOT a signed release)
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
else
  export PAPER_READER_PYTHON_BUNDLE_MODE="cache"
  PYTHON_ARG="cache"
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
echo " DEVELOPER_DIR=${DEVELOPER_DIR:-'(unset)'}"
echo " PAPER_READER_SIGN=${PAPER_READER_SIGN:-0}"
echo "=========================================="

WALL0="$(now_ms)"
: >"$TIMING_FILE"

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

# Always produce .app first. DMG is built later from the finalized .app so a
# signed release never packages a pre-sign snapshot into the disk image.
t0="$(now_ms)"
npx tauri build --bundles app --ci
app_bundle_s="$(elapsed_s "$t0")"
echo "app_bundle_s=$app_bundle_s" >>"$TIMING_FILE"
echo "⏱  Tauri .app bundle: ${app_bundle_s}s"

APP_PATH="src-tauri/target/release/bundle/macos/Paper Reader.app"
DMG_PATH="src-tauri/target/release/bundle/dmg/Paper Reader_0.1.0_aarch64.dmg"
STAGE_MODE_FILE="src-tauri/bundled-resources/translation-server/.paper-reader-bundle-mode"
if [[ -f "$STAGE_MODE_FILE" ]]; then
  STAGED_MODE="$(tr -d '[:space:]' < "$STAGE_MODE_FILE")"
else
  STAGED_MODE="unknown"
fi

if [[ "$MODE" == "clean" && "$STAGED_MODE" != "clean" ]]; then
  echo "エラー: clean build なのに staged mode=$STAGED_MODE"
  exit 1
fi

SIGNED_RELEASE="no"
dmg_s="skipped"

if [[ "$MODE" == "clean" && "${PAPER_READER_SIGN:-}" == "1" ]]; then
  echo
  echo "== Signing / notarization (PAPER_READER_SIGN=1) =="
  echo "Order: sign .app → notarize/staple → DMG from signed .app → sign DMG"
  t0="$(now_ms)"
  # macos-sign-notarize.sh builds the DMG from the signed app (do not pre-build DMG).
  PAPER_READER_SKIP_DMG=0 bash "$SCRIPT_DIR/macos-sign-notarize.sh"
  dmg_s="$(elapsed_s "$t0")"
  echo "dmg_s=$dmg_s" >>"$TIMING_FILE"
  echo "sign_notarize_s=$dmg_s" >>"$TIMING_FILE"
  SIGNED_RELEASE="yes"
elif [[ "$MODE" == "clean" ]]; then
  echo
  echo "== Unsigned DMG from .app (credentials not requested) =="
  echo "Result: unsigned acceptance only — NOT a signed release."
  t0="$(now_ms)"
  bash "$SCRIPT_DIR/macos-build-dmg.sh"
  dmg_s="$(elapsed_s "$t0")"
  echo "dmg_s=$dmg_s" >>"$TIMING_FILE"
  echo "⏱  DMG generation: ${dmg_s}s"
else
  echo "dmg_s=skipped" >>"$TIMING_FILE"
  echo "⏱  DMG generation: skipped (fast mode)"
fi

wall_s="$(elapsed_s "$WALL0")"
echo "wall_s=$wall_s" >>"$TIMING_FILE"

echo
echo "========== Build timings ($MODE) =========="
printf "  Python runtime prep : %ss\n" "$(read_timing python_prep_s)"
printf "  Stage resources     : %ss\n" "$(read_timing stage_s)"
printf "  Frontend build      : %ss\n" "$(read_timing frontend_s)"
printf "  Rust compile        : %ss\n" "$(read_timing rust_s)"
printf "  Tauri .app bundle   : %ss\n" "$(read_timing app_bundle_s)"
printf "  DMG / sign phase    : %s\n" "$(read_timing dmg_s)"
printf "  Wall clock          : %ss\n" "$wall_s"
echo "==========================================="
echo "✓ .app: $APP_PATH"
if [[ "$MODE" == "clean" ]]; then
  echo "✓ .dmg: $DMG_PATH"
fi
echo "  staged python mode: $STAGED_MODE"
echo "  signed release: $SIGNED_RELEASE"
echo "  timings file: $TIMING_FILE"
if [[ "$MODE" == "clean" && "$SIGNED_RELEASE" != "yes" ]]; then
  echo "  note: unsigned acceptance passed path only (set PAPER_READER_SIGN=1 for signed release)"
fi
