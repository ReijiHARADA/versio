#!/usr/bin/env bash
# Layer A — Packaged integration E2E (real .app, service-assisted acceptance).
# Not a substitute for Layer B UI E2E.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP_PATH="${PAPER_READER_APP_PATH:-$ROOT/src-tauri/target/release/bundle/macos/Paper Reader.app}"
ARTIFACT_DIR="$ROOT/scripts/packaged-e2e/artifacts/integration"
FIXTURE_PDF="${PAPER_READER_E2E_FIXTURE:-$ROOT/test-fixtures/generated-pdfs/single-column.pdf}"
if [[ ! -f "$FIXTURE_PDF" ]]; then
  FIXTURE_PDF="$ROOT/scripts/packaged-e2e/fixture-tiny.pdf"
fi
ACCEPTANCE_HOME="${PAPER_READER_ACCEPTANCE_HOME:-$ARTIFACT_DIR/app-data-$$}"
LOG_FILE="$ARTIFACT_DIR/app.log"
STEP_FILE="$ARTIFACT_DIR/step.txt"

mkdir -p "$ARTIFACT_DIR"
rm -rf "$ACCEPTANCE_HOME"
mkdir -p "$ACCEPTANCE_HOME"
: >"$LOG_FILE"
echo "init" >"$STEP_FILE"

fail() {
  echo "FAIL: $*" | tee -a "$LOG_FILE"
  echo "step=$(cat "$STEP_FILE" 2>/dev/null || echo unknown)" | tee -a "$LOG_FILE"
  echo "app-data=$ACCEPTANCE_HOME" | tee -a "$LOG_FILE"
  if [[ -d "$ACCEPTANCE_HOME" ]]; then
    find "$ACCEPTANCE_HOME" -maxdepth 5 -type f 2>/dev/null | head -120 >>"$LOG_FILE" || true
  fi
  RESULT="$(find "$ACCEPTANCE_HOME" -path '*/_acceptance/result.json' 2>/dev/null | head -1 || true)"
  if [[ -n "$RESULT" && -f "$RESULT" ]]; then
    echo "--- acceptance result ---" >>"$LOG_FILE"
    cat "$RESULT" >>"$LOG_FILE" || true
    cp "$RESULT" "$ARTIFACT_DIR/result.json" 2>/dev/null || true
  fi
  screencapture -x "$ARTIFACT_DIR/failure.png" 2>/dev/null || true
  exit 1
}

step() {
  echo "$1" | tee "$STEP_FILE"
  echo "==> $1" | tee -a "$LOG_FILE"
}

if [[ "$(uname -s)" != "Darwin" ]]; then
  fail "packaged e2e requires macOS"
fi

if [[ ! -d "$APP_PATH" ]]; then
  fail "app not found: $APP_PATH (build with npm run tauri:build:clean first)"
fi

if [[ ! -f "$FIXTURE_PDF" ]]; then
  step "generate fixture pdf"
  FIXTURE_PDF="$ROOT/scripts/packaged-e2e/fixture-tiny.pdf"
  python3 - "$FIXTURE_PDF" <<'PY'
import sys
from pathlib import Path
path = Path(sys.argv[1])
path.parent.mkdir(parents=True, exist_ok=True)
pdf = b"""%PDF-1.1
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 55 >>stream
BT /F1 12 Tf 72 720 Td (Acceptance Fixture) Tj ET
endstream
endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000372 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
445
%%EOF
"""
path.write_bytes(pdf)
print(path)
PY
fi

BIN="$APP_PATH/Contents/MacOS/app"
if [[ ! -x "$BIN" ]]; then
  BIN=$(find "$APP_PATH/Contents/MacOS" -type f -perm +111 | head -1)
fi
[[ -x "$BIN" ]] || fail "executable not found inside .app"

find_result() {
  find "$ACCEPTANCE_HOME" -path '*/_acceptance/result.json' 2>/dev/null | head -1 || true
}

wait_for_step() {
  local want="$1"
  local timeout_s="${2:-180}"
  local i
  for i in $(seq 1 "$timeout_s"); do
    local result
    result="$(find_result)"
    if [[ -n "$result" && -f "$result" ]]; then
      cp "$result" "$ARTIFACT_DIR/result.json" 2>/dev/null || true
      if python3 - "$result" "$want" <<'PY'
import json, sys
path, want = sys.argv[1], sys.argv[2]
data = json.load(open(path))
step = data.get("step") or ""
ok = bool(data.get("ok"))
hits = int(data.get("searchHits") or 0)
if want == "ready_for_relaunch":
    sys.exit(0 if ok and step == "ready_for_relaunch" and hits > 0 else 1)
if want == "relaunch_ok":
    sys.exit(0 if ok and step == "relaunch_ok" else 1)
sys.exit(1)
PY
      then
        return 0
      fi
      if python3 - "$result" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
step = data.get("step") or ""
sys.exit(0 if step in {"error", "import_timeout", "reader_body_missing", "relaunch_data_missing", "search_empty"} else 1)
PY
      then
        fail "acceptance marker terminal failure ($(cat "$result"))"
      fi
    fi
    sleep 1
  done
  fail "timeout waiting for step=$want"
}

launch_app() {
  step "launch app"
  HOME="$ACCEPTANCE_HOME" \
  PAPER_READER_ACCEPTANCE=1 \
  PAPER_READER_ACCEPTANCE_FIXTURE="$FIXTURE_PDF" \
    "$BIN" >>"$LOG_FILE" 2>&1 &
  APP_PID=$!
  echo "pid=$APP_PID" >>"$LOG_FILE"
  sleep 3
  if ! kill -0 "$APP_PID" 2>/dev/null; then
    fail "app exited immediately after launch"
  fi
}

quit_app() {
  step "quit app"
  if [[ -n "${APP_PID:-}" ]] && kill -0 "$APP_PID" 2>/dev/null; then
    kill "$APP_PID" 2>/dev/null || true
    wait "$APP_PID" 2>/dev/null || true
  fi
  osascript -e 'tell application "Paper Reader" to quit' 2>/dev/null || true
  sleep 2
}

launch_app
step "wait import→annotation→search→export"
wait_for_step "ready_for_relaunch" 180

find "$ACCEPTANCE_HOME" -name 'library.sqlite' | grep -q . || fail "library.sqlite missing after import"
find "$ACCEPTANCE_HOME" -path '*/papers/*/paper.json' | grep -q . || fail "paper package missing after import"
[[ -f "$ARTIFACT_DIR/result.json" ]] || fail "result marker missing"
python3 - "$ARTIFACT_DIR/result.json" <<'PY' || fail "export/search marker incomplete"
import json, sys
data = json.load(open(sys.argv[1]))
assert data.get("annotationId"), "annotationId missing"
assert (data.get("exportBytes") or 0) > 0, "export empty"
assert (data.get("notionBytes") or 0) > 0, "Notion ZIP empty"
assert int(data.get("searchHits") or 0) > 0, "searchHits must be > 0"
print("marker ok", data.get("paperId"), "hits", data.get("searchHits"))
PY

quit_app
launch_app
step "wait relaunch persistence"
wait_for_step "relaunch_ok" 120
quit_app

step "done"
echo "OK packaged integration E2E. Artifacts: $ARTIFACT_DIR" | tee -a "$LOG_FILE"
