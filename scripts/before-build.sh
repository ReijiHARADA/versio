#!/bin/bash
# Tauri beforeBuildCommand entrypoint.
# Builds frontend. When VERSIO_SKIP_BEFORE_BUILD=1, no-ops (wrapper already ran phases).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TIMING_FILE="${VERSIO_BUILD_TIMINGS:-$PROJECT_DIR/.build-timings}"

if [[ "${VERSIO_SKIP_BEFORE_BUILD:-0}" == "1" ]]; then
  echo "before-build: skipped (VERSIO_SKIP_BEFORE_BUILD=1)"
  exit 0
fi

cd "$PROJECT_DIR"

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

echo "=== before-build ==="

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
