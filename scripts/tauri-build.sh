#!/bin/bash
# Packaged Tauri build with fast (daily) vs clean (release) modes + phase timings.
#
# Clean + signing (optional):
#   VERSIO_SIGN=1 bash scripts/tauri-build.sh clean
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

export VERSIO_BUILD_TIMINGS="$TIMING_FILE"

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
echo " Versio tauri build ($MODE)"
echo " DEVELOPER_DIR=${DEVELOPER_DIR:-'(unset)'}"
echo " VERSIO_SIGN=${VERSIO_SIGN:-0}"
echo "=========================================="

WALL0="$(now_ms)"
: >"$TIMING_FILE"

t0="$(now_ms)"
bash "$SCRIPT_DIR/build-llama-server.sh"
llama_s="$(elapsed_s "$t0")"
echo "llama_server_s=$llama_s" >>"$TIMING_FILE"
echo "⏱  llama-server: ${llama_s}s"

t0="$(now_ms)"
npm run build
frontend_s="$(elapsed_s "$t0")"
echo "frontend_s=$frontend_s" >>"$TIMING_FILE"
echo "⏱  Frontend build: ${frontend_s}s"

export VERSIO_SKIP_BEFORE_BUILD=1
# Warm fast rebuilds: keep incremental artifacts even for --release.
if [[ "$MODE" == "fast" ]]; then
  export CARGO_INCREMENTAL="${CARGO_INCREMENTAL:-1}"
fi

# Single tauri invocation (compile + .app). Previously we ran --no-bundle then
# --bundles app separately for phase timing; that paid for two release links.
# DMG is still built later from the finalized .app so signed releases never
# package a pre-sign snapshot.
t0="$(now_ms)"
# VERSIO_TAURI_CONFIG: extra JSON merged into tauri.conf (e.g. the separate onboarding test app identity).
npx tauri build --bundles app --ci ${VERSIO_TAURI_CONFIG:+--config "$VERSIO_TAURI_CONFIG"}
rust_bundle_s="$(elapsed_s "$t0")"
echo "rust_s=$rust_bundle_s" >>"$TIMING_FILE"
echo "app_bundle_s=included_in_rust_s" >>"$TIMING_FILE"
echo "⏱  Rust compile + .app bundle: ${rust_bundle_s}s"

APP_PATH="src-tauri/target/release/bundle/macos/Versio.app"
DMG_PATH="src-tauri/target/release/bundle/dmg/Versio_0.1.0_aarch64.dmg"
SIGNED_RELEASE="no"
dmg_s="skipped"

if [[ "$MODE" == "clean" && "${VERSIO_SIGN:-}" == "1" ]]; then
  echo
  echo "== Signing / notarization (VERSIO_SIGN=1) =="
  echo "Order: sign .app → notarize/staple → DMG from signed .app → sign DMG"
  t0="$(now_ms)"
  # macos-sign-notarize.sh builds the DMG from the signed app (do not pre-build DMG).
  VERSIO_SKIP_DMG=0 bash "$SCRIPT_DIR/macos-sign-notarize.sh"
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
printf "  llama-server        : %ss\n" "$(read_timing llama_server_s)"
printf "  Frontend build      : %ss\n" "$(read_timing frontend_s)"
printf "  Rust + .app bundle  : %ss\n" "$(read_timing rust_s)"
printf "  DMG / sign phase    : %s\n" "$(read_timing dmg_s)"
printf "  Wall clock          : %ss\n" "$wall_s"
echo "==========================================="
echo "✓ .app: $APP_PATH"
if [[ "$MODE" == "clean" ]]; then
  echo "✓ .dmg: $DMG_PATH"
fi
echo "  signed release: $SIGNED_RELEASE"
echo "  timings file: $TIMING_FILE"
if [[ "$MODE" == "clean" && "$SIGNED_RELEASE" != "yes" ]]; then
  echo "  note: unsigned acceptance passed path only (set VERSIO_SIGN=1 for signed release)"
fi
