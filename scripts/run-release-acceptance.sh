#!/usr/bin/env bash
# Packaged .app release acceptance helper (macOS).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Versio release acceptance =="
echo "See docs/RELEASE_ACCEPTANCE.md for the full checklist."
echo

run_gate() {
  echo "-- $1"
  shift
  "$@"
  echo
}

run_gate "TypeScript lint" npm run lint
run_gate "TypeScript tests" npm test
run_gate "TypeScript build" npm run build

if command -v cargo >/dev/null 2>&1; then
  (
    cd src-tauri
    run_gate "Rust fmt" cargo fmt --check
    run_gate "Rust clippy" cargo clippy --all-targets -- -D warnings
    run_gate "Rust tests" cargo test
  )
else
  echo "skip Rust (cargo not found)"
fi

echo "-- Library benchmark (100 papers)"
npm run bench:library -- --count 100

echo "-- Browser smoke (requires preview on :5173 if not started)"
if curl -sf http://127.0.0.1:5173/ >/dev/null 2>&1; then
  VERSIO_URL=http://127.0.0.1:5173 npm run verify:browser
else
  echo "Start preview first: npm run preview -- --host 127.0.0.1 --port 5173"
  echo "Then re-run this script or: VERSIO_URL=http://127.0.0.1:5173 npm run verify:browser"
fi

echo
APP_DEFAULT="$ROOT/src-tauri/target/release/bundle/macos/Versio.app"
if [[ "$(uname -s)" == "Darwin" && -d "${VERSIO_APP_PATH:-$APP_DEFAULT}" ]]; then
  run_gate "Packaged integration E2E (Layer A)" npm run packaged:e2e:integration
  run_gate "Packaged UI E2E (Layer B)" npm run packaged:e2e:ui
else
  echo "-- Packaged .app E2E skipped (build .app first: npm run tauri:build:clean)"
fi

echo
if [[ "${VERSIO_SIGN:-}" == "1" ]]; then
  echo "== Signed release path requested (VERSIO_SIGN=1) =="
  echo "Ensure Apple credentials are set; see docs/MACOS_RELEASE.md"
else
  echo "== Signing status =="
  echo "unsigned acceptance path (signed acceptance not executed)"
  echo "For signed release: VERSIO_SIGN=1 npm run tauri:build:clean"
fi

echo
echo "== Remaining manual acceptance (OS-dependent) =="
cat <<'EOF'
1. Source PDF open / Preview page jump (Accessibility-dependent)
2. Full Reader navigation feel (scroll / outline / glossary)
3. Gatekeeper first-launch experience on a clean Mac (after signed build)
Daily unsigned check: npm run tauri:build:fast
EOF
