#!/usr/bin/env bash
# Packaged .app release acceptance helper (macOS).
# Does NOT download MADLAD weights — run model warmup separately on nightly/release.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Paper Reader release acceptance =="
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

run_gate "Python bundle cache smoke" npm run test:bundle-python

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

if command -v python3 >/dev/null 2>&1; then
  (
    cd translation-server
    run_gate "Python citation_protect" python3 -m unittest tests.test_citation_protect -v
  )
else
  echo "skip Python (python3 not found)"
fi

echo "-- Library benchmark (100 papers)"
npm run bench:library -- --count 100

echo "-- Browser smoke (requires preview on :5173 if not started)"
if curl -sf http://127.0.0.1:5173/ >/dev/null 2>&1; then
  PAPER_READER_URL=http://127.0.0.1:5173 npm run verify:browser
else
  echo "Start preview first: npm run preview -- --host 127.0.0.1 --port 5173"
  echo "Then re-run this script or: PAPER_READER_URL=http://127.0.0.1:5173 npm run verify:browser"
fi

echo
APP_DEFAULT="$ROOT/src-tauri/target/release/bundle/macos/Paper Reader.app"
if [[ "$(uname -s)" == "Darwin" && -d "${PAPER_READER_APP_PATH:-$APP_DEFAULT}" ]]; then
  run_gate "Packaged .app E2E (real .app, no MADLAD)" npm run packaged:e2e
else
  echo "-- Packaged .app E2E skipped (build .app first: npm run tauri:build:clean)"
fi

echo
echo "== Remaining manual acceptance (OS-dependent) =="
cat <<'EOF'
Automated: npm run packaged:e2e (import → annotation → search → export → relaunch)
Manual still required:
1. Source PDF open / Preview page jump (Accessibility-dependent)
2. Full UI Reader navigation feel + ⌘K / ⌘F interaction
3. (Release) PAPER_READER_SIGN=1 npm run tauri:build:clean — see docs/MACOS_RELEASE.md
4. (Nightly) MADLAD ready → translation resume
Daily unsigned check: npm run tauri:build:fast
EOF
