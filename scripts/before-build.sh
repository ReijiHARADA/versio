#!/bin/bash
# Tauri beforeBuildCommand entrypoint.
# Prepares cached/clean Python runtime, stages minimal resources, builds frontend.
# When VERSIO_SKIP_BEFORE_BUILD=1, no-ops (wrapper already ran phases).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TIMING_FILE="${VERSIO_BUILD_TIMINGS:-$PROJECT_DIR/.build-timings}"

if [[ "${VERSIO_SKIP_BEFORE_BUILD:-0}" == "1" ]]; then
  echo "before-build: skipped (VERSIO_SKIP_BEFORE_BUILD=1)"
  exit 0
fi

cd "$PROJECT_DIR"

# Compile the macOS-native Apple Translation adapter when the matching Xcode
# toolchain is available. The app remains MADLAD-capable if it is not.
bash "$SCRIPT_DIR/compile-apple-translation.sh"

MODE="${VERSIO_PYTHON_BUNDLE_MODE:-cache}"
export VERSIO_PYTHON_BUNDLE_MODE="$MODE"

now_ms() {
  python3 -c 'import time; print(int(time.time() * 1000))'
}

elapsed_s() {
  local start="$1"
  local end
  end="$(now_ms)"
  python3 -c "print(f'{($end - $start) / 1000:.1f}')"
}

: >"$TIMING_FILE"

echo "=== before-build (python mode=$MODE) ==="

t0="$(now_ms)"
bash "$SCRIPT_DIR/bundle-python.sh" "$MODE"
python_s="$(elapsed_s "$t0")"
echo "python_prep_s=$python_s" >>"$TIMING_FILE"
echo "⏱  Python runtime: ${python_s}s"

t0="$(now_ms)"
bash "$SCRIPT_DIR/stage-translation-bundle.sh"
stage_s="$(elapsed_s "$t0")"
echo "stage_s=$stage_s" >>"$TIMING_FILE"
echo "⏱  Stage resources: ${stage_s}s"
echo "note: translation venv is staged separately; run scripts/inject-translation-venv.sh after the .app bundle (npm run tauri:build:fast does this)."

t0="$(now_ms)"
npm run build
frontend_s="$(elapsed_s "$t0")"
echo "frontend_s=$frontend_s" >>"$TIMING_FILE"
echo "⏱  Frontend build: ${frontend_s}s"
