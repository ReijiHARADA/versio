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
echo "== Packaged .app manual steps (human) =="
cat <<'EOF'
1. npm run tauri:build:clean   # clean Python + .app + .dmg (release)
   # daily check: npm run tauri:build:fast  (.app only, cached Python)
2. open src-tauri/target/release/bundle/macos/*.app
3. PDF import → Reader → annotation → search → source PDF → export
4. Quit and relaunch → reading position + annotations recover
5. (Nightly) wait for MADLAD ready → translation resume
EOF
