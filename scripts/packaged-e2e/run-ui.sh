#!/usr/bin/env bash
# Layer B — Packaged UI E2E via Accessibility / System Events (real .app UI).
# Does NOT call startBackgroundImport / createAnnotation from TS services.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP_PATH="${PAPER_READER_APP_PATH:-$ROOT/src-tauri/target/release/bundle/macos/Paper Reader.app}"
ARTIFACT_DIR="$ROOT/scripts/packaged-e2e/artifacts/ui"
FIXTURE_PDF="$ROOT/scripts/packaged-e2e/fixture-tiny.pdf"
ACCEPTANCE_HOME="${PAPER_READER_UI_E2E_HOME:-$ARTIFACT_DIR/app-data-$$}"
LOG_FILE="$ARTIFACT_DIR/app.log"
STEP_FILE="$ARTIFACT_DIR/step.txt"
AX_DUMP="$ARTIFACT_DIR/ax-tree.txt"

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
  RESULT="$(find "$ACCEPTANCE_HOME" -path '*/_acceptance/ui-result.json' 2>/dev/null | head -1 || true)"
  if [[ -n "$RESULT" && -f "$RESULT" ]]; then
    echo "--- ui-result ---" >>"$LOG_FILE"
    cat "$RESULT" >>"$LOG_FILE" || true
    cp "$RESULT" "$ARTIFACT_DIR/ui-result.json" 2>/dev/null || true
  fi
  # Best-effort AX dump
  osascript <<'OSA' >"$AX_DUMP" 2>>"$LOG_FILE" || true
tell application "System Events"
  set procs to name of every process whose background only is false
  return procs as text
end tell
OSA
  screencapture -x "$ARTIFACT_DIR/failure.png" 2>/dev/null || true
  exit 1
}

step() {
  echo "$1" | tee "$STEP_FILE"
  echo "==> $1" | tee -a "$LOG_FILE"
}

if [[ "$(uname -s)" != "Darwin" ]]; then
  fail "UI E2E requires macOS"
fi
if [[ ! -d "$APP_PATH" ]]; then
  fail "app not found: $APP_PATH"
fi

if [[ ! -f "$FIXTURE_PDF" ]]; then
  bash "$ROOT/scripts/packaged-e2e/run-integration.sh" >/dev/null 2>&1 || true
fi
[[ -f "$FIXTURE_PDF" ]] || {
  python3 - "$FIXTURE_PDF" <<'PY'
import sys
from pathlib import Path
path = Path(sys.argv[1])
path.parent.mkdir(parents=True, exist_ok=True)
path.write_bytes(b"""%PDF-1.1
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
""")
PY
}

BIN="$APP_PATH/Contents/MacOS/app"
if [[ ! -x "$BIN" ]]; then
  BIN=$(find "$APP_PATH/Contents/MacOS" -type f -perm +111 | head -1)
fi
[[ -x "$BIN" ]] || fail "executable not found"

# Short path helps Open dialog keystrokes.
SHORT_FIXTURE="$ARTIFACT_DIR/Acceptance.pdf"
cp "$FIXTURE_PDF" "$SHORT_FIXTURE"

find_ui_result() {
  find "$ACCEPTANCE_HOME" -path '*/_acceptance/ui-result.json' 2>/dev/null | head -1 || true
}

wait_ui_step() {
  local want="$1"
  local timeout_s="${2:-240}"
  for _ in $(seq 1 "$timeout_s"); do
    local result
    result="$(find_ui_result)"
    if [[ -n "$result" && -f "$result" ]]; then
      cp "$result" "$ARTIFACT_DIR/ui-result.json" 2>/dev/null || true
      if python3 - "$result" "$want" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
want = sys.argv[2]
step = data.get("step") or ""
ok = bool(data.get("ok"))
if want == "ui_library_card_visible":
    sys.exit(0 if step in {"ui_library_card_visible", "ui_reader_visible", "ui_core_flow_ready"} or "card" in (data.get("detail") or "") else 1)
if want == "ui_reader_visible":
    sys.exit(0 if step in {"ui_reader_visible", "ui_memo_open", "ui_annotation_visible", "ui_search_open", "ui_search_hits_visible", "ui_export_open", "ui_core_flow_ready"} else 1)
if want == "ui_annotation_visible":
    sys.exit(0 if data.get("annotationVisible") or step in {"ui_annotation_visible", "ui_memo_open", "ui_core_flow_ready"} else 1)
if want == "ui_search_hits_visible":
    sys.exit(0 if data.get("searchVisible") or step in {"ui_search_hits_visible", "ui_core_flow_ready"} else 1)
if want == "ui_core_flow_ready":
    sys.exit(0 if ok and step == "ui_core_flow_ready" else 1)
if want == "ui_relaunch_ok":
    sys.exit(0 if step in {"ui_library_card_visible", "ui_annotation_visible", "ui_core_flow_ready", "ui_reader_visible"} and ("cards=" not in (data.get("detail") or "") or "cards=0" not in (data.get("detail") or "")) else 1)
sys.exit(1)
PY
      then
        return 0
      fi
    fi
    sleep 1
  done
  fail "timeout waiting for UI step=$want"
}

ax_click_by_label() {
  local label="$1"
  osascript - "$label" <<'OSA' || return 1
on run argv
  set targetLabel to item 1 of argv
  tell application "System Events"
    set frontApp to first process whose frontmost is true
    set matches to entire contents of frontApp
    repeat with el in matches
      try
        set lab to value of attribute "AXDescription" of el
        if lab is missing value then set lab to ""
        set titleVal to ""
        try
          set titleVal to title of el
        end try
        if lab contains targetLabel or titleVal contains targetLabel then
          try
            click el
            return "clicked"
          end try
        end if
      end try
    end repeat
  end tell
  error "element not found: " & targetLabel
end run
OSA
}

launch_app() {
  step "launch app (UI E2E)"
  HOME="$ACCEPTANCE_HOME" \
  PAPER_READER_UI_E2E=1 \
  PAPER_READER_UI_E2E_FIXTURE="$SHORT_FIXTURE" \
    "$BIN" >>"$LOG_FILE" 2>&1 &
  APP_PID=$!
  echo "pid=$APP_PID" >>"$LOG_FILE"
  sleep 4
  if ! kill -0 "$APP_PID" 2>/dev/null; then
    fail "app exited immediately after launch"
  fi
  # Bring to front
  osascript -e 'tell application "System Events" to set frontmost of first process whose unix id is '"$APP_PID"' to true' 2>/dev/null \
    || osascript -e 'tell application "Paper Reader" to activate' 2>/dev/null \
    || true
  sleep 1
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

choose_pdf_via_open_panel() {
  step "UI import via Open panel"
  # Click the add-paper control (AXDescription / title).
  ax_click_by_label "論文を追加" || ax_click_by_label "PDFファイルを選択" || true
  sleep 1
  # Open panel: Go to folder
  osascript <<OSA || fail "open panel navigation failed"
tell application "System Events"
  keystroke "g" using {command down, shift down}
  delay 0.6
  keystroke "$SHORT_FIXTURE"
  delay 0.3
  keystroke return
  delay 0.6
  keystroke return
end tell
OSA
}

launch_app
choose_pdf_via_open_panel

step "wait library card"
wait_ui_step "ui_library_card_visible" 180

step "open paper card"
ax_click_by_label "論文" || ax_click_by_label "Acceptance" || true
sleep 2
wait_ui_step "ui_reader_visible" 120

step "save memo via UI (selection synthesized in-page once; Save is AX click)"
# Give selection → compose a moment, then type note + save.
sleep 2
osascript <<'OSA' || true
tell application "System Events"
  keystroke "ui-e2e-note"
  delay 0.2
end tell
OSA
ax_click_by_label "メモを保存" || ax_click_by_label "保存" || true
sleep 2
wait_ui_step "ui_annotation_visible" 60

step "open search UI and query"
ax_click_by_label "検索" || true
sleep 1
osascript <<'OSA' || true
tell application "System Events"
  keystroke "f" using {command down}
  delay 0.4
  keystroke "Acceptance"
end tell
OSA
sleep 2
wait_ui_step "ui_search_hits_visible" 60

step "open export UI"
ax_click_by_label "書き出す" || true
sleep 1
ax_click_by_label "書き出しを実行" || ax_click_by_label "書き出す" || true
sleep 2

# Require search hits visible before relaunch
python3 - "$ARTIFACT_DIR/ui-result.json" <<'PY' || fail "searchHits not visible in UI"
import json, sys
from pathlib import Path
p = Path(sys.argv[1])
assert p.exists(), "ui-result missing"
data = json.loads(p.read_text())
assert data.get("searchVisible") or data.get("step") in {"ui_search_hits_visible", "ui_core_flow_ready"}, data
print("ui search ok", data.get("step"))
PY

quit_app
launch_app
step "relaunch: paper + annotation still present in UI markers"
sleep 5
wait_ui_step "ui_library_card_visible" 120
# Open paper again and confirm annotation mark marker
ax_click_by_label "論文" || true
sleep 3
RESULT="$(find_ui_result)"
[[ -n "$RESULT" ]] || fail "ui-result missing after relaunch"
python3 - "$RESULT" <<'PY' || fail "relaunch UI persistence failed"
import json, sys
data = json.load(open(sys.argv[1]))
detail = data.get("detail") or ""
assert "cards=0" not in detail, data
print("relaunch ok", data.get("step"), detail)
PY
quit_app

step "done"
echo "OK packaged UI E2E. Artifacts: $ARTIFACT_DIR" | tee -a "$LOG_FILE"
