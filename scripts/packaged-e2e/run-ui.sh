#!/usr/bin/env bash
# Layer B — Packaged UI E2E via Accessibility / System Events (real .app UI).
#
# Constraint: WKWebView AX text selection is unreliable. Selection is synthesized
# once in-page; Save / Search / Export remain external UI actions.
#
# Asserts: Library → Reader → annotation mark → search hits → export file
#          → quit → relaunch → Reader → persisted annotation mark
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP_PATH="${PAPER_READER_APP_PATH:-$ROOT/src-tauri/target/release/bundle/macos/Paper Reader.app}"
ARTIFACT_DIR="$ROOT/scripts/packaged-e2e/artifacts/ui"
FIXTURE_PDF="${PAPER_READER_E2E_FIXTURE:-$ROOT/test-fixtures/generated-pdfs/single-column.pdf}"
if [[ ! -f "$FIXTURE_PDF" ]]; then
  FIXTURE_PDF="$ROOT/scripts/packaged-e2e/fixture-tiny.pdf"
fi
ACCEPTANCE_HOME="${PAPER_READER_UI_E2E_HOME:-${PAPER_READER_ACCEPTANCE_HOME:-$ARTIFACT_DIR/app-data-$$}}"
# The UI harness isolates application data by replacing HOME. Keep the model
# cache outside that isolated home so every run does not redownload MADLAD
# before it can exercise the import UI. This is cache-only: library data,
# packages, exports, and acceptance markers remain under ACCEPTANCE_HOME.
HOST_HF_HOME="${PAPER_READER_UI_E2E_HF_HOME:-${HF_HOME:-$HOME/.cache/huggingface}}"
LOG_FILE="$ARTIFACT_DIR/app.log"
STEP_FILE="$ARTIFACT_DIR/step.txt"
AX_DUMP="$ARTIFACT_DIR/ax-tree.txt"
SUPPORT_REL="Library/Application Support/com.harada.paper-reader"

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
    find "$ACCEPTANCE_HOME" -maxdepth 6 -type f 2>/dev/null | head -160 >>"$LOG_FILE" || true
  fi
  RESULT="$(find "$ACCEPTANCE_HOME" -path '*/_acceptance/ui-result.json' 2>/dev/null | head -1 || true)"
  if [[ -n "$RESULT" && -f "$RESULT" ]]; then
    echo "--- ui-result ---" >>"$LOG_FILE"
    cat "$RESULT" >>"$LOG_FILE" || true
    cp "$RESULT" "$ARTIFACT_DIR/ui-result.json" 2>/dev/null || true
  fi
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
  python3 - "$ROOT/scripts/packaged-e2e/fixture-tiny.pdf" <<'PY'
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
  FIXTURE_PDF="$ROOT/scripts/packaged-e2e/fixture-tiny.pdf"
fi

BIN="$APP_PATH/Contents/MacOS/app"
if [[ ! -x "$BIN" ]]; then
  BIN=$(find "$APP_PATH/Contents/MacOS" -type f -perm +111 | head -1)
fi
[[ -x "$BIN" ]] || fail "executable not found"

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
phase = data.get("phase") or "initial"

def has_ann():
    return bool(data.get("annotationVisible"))

if want == "ui_library_card_visible":
    sys.exit(0 if step in {
        "ui_library_card_visible",
        "ui_relaunch_library_card_visible",
        "ui_reader_visible",
        "ui_relaunch_reader_visible",
        "ui_core_flow_ready",
        "ui_relaunch_annotation_visible",
    } else 1)
if want == "ui_reader_visible":
    sys.exit(0 if "reader" in step or step in {"ui_core_flow_ready", "ui_relaunch_annotation_visible"} else 1)
if want == "ui_annotation_visible":
    sys.exit(0 if has_ann() or step in {"ui_annotation_visible", "ui_core_flow_ready"} else 1)
if want == "ui_search_hits_visible":
    sys.exit(0 if data.get("searchVisible") or step in {"ui_search_hits_visible", "ui_core_flow_ready"} else 1)
if want == "ui_export_completed":
    sys.exit(0 if data.get("exportCompleted") and int(data.get("exportBytes") or 0) > 0 else 1)
if want == "ui_core_flow_ready":
    sys.exit(0 if ok and step == "ui_core_flow_ready" and data.get("exportCompleted") and has_ann() and data.get("searchVisible") else 1)
if want == "ui_relaunch_annotation_visible":
    sys.exit(0 if phase == "relaunch" and has_ann() and step == "ui_relaunch_annotation_visible" and ok else 1)
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
  with timeout of 10 seconds
    tell application "System Events"
      set frontApp to first process whose frontmost is true
      -- Native controls are cheap to query. Try this before recursively
      -- walking a large WKWebView accessibility tree during startup.
      try
        click button targetLabel of window 1 of frontApp
        return "clicked"
      end try
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
  end timeout
  error "element not found: " & targetLabel
end run
OSA
}

launch_app() {
  step "launch app (UI E2E)"
  HOME="$ACCEPTANCE_HOME" \
  HF_HOME="$HOST_HF_HOME" \
  PAPER_READER_ACCEPTANCE=1 \
  PAPER_READER_ACCEPTANCE_HOME="$ACCEPTANCE_HOME" \
  PAPER_READER_ACCEPTANCE_FIXTURE="$SHORT_FIXTURE" \
  PAPER_READER_UI_E2E=1 \
  PAPER_READER_UI_E2E_SMOKE_ONLY="${PAPER_READER_UI_E2E_SMOKE_ONLY:-0}" \
  # Use the same Tauri read_dropped_pdf + startBackgroundImport path as a
  # selected PDF, while avoiding the flaky native picker/IME interaction in
  # deterministic packaged UI runs.
  PAPER_READER_UI_E2E_DIRECT_IMPORT=1 \
  PAPER_READER_UI_E2E_HOME="$ACCEPTANCE_HOME" \
  PAPER_READER_UI_E2E_FIXTURE="$SHORT_FIXTURE" \
    "$BIN" >>"$LOG_FILE" 2>&1 &
  APP_PID=$!
  echo "pid=$APP_PID" >>"$LOG_FILE"
  sleep 4
  if ! kill -0 "$APP_PID" 2>/dev/null; then
    fail "app exited immediately after launch"
  fi
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
  if [[ "${PAPER_READER_UI_E2E_DIRECT_IMPORT:-1}" == "1" ]]; then
    step "UI fixture import via Tauri read_dropped_pdf"
    return 0
  fi
  # WKWebView exposes the button tree shortly after the native window exists.
  # Retry boundedly instead of allowing the first startup-time AX walk to
  # block the whole acceptance run.
  for _ in 1 2 3; do
    ax_click_by_label "論文を追加" && break
    ax_click_by_label "PDFファイルを選択" && break
    sleep 2
  done
  sleep 1
  # Paste the POSIX path. `keystroke "$SHORT_FIXTURE"` is altered by an
  # active Japanese IME (for example `-`/`.` become full-width glyphs), which
  # leaves NSOpenPanel on an unresolved Go-to-Folder sheet.
  printf '%s' "$SHORT_FIXTURE" | pbcopy
  osascript <<OSA || fail "open panel navigation failed"
tell application "System Events"
  set p to first process whose unix id is $APP_PID
  set frontmost of p to true
  keystroke "g" using {command down, shift down}
  delay 0.6
  keystroke "v" using {command down}
  delay 1
  -- The Go-to-Folder sheet resolves the pasted file before the open panel
  -- receives a second Enter. Keep the app frontmost and send that second
  -- confirmation after the selection is visible.
  key code 36
  delay 1
  set frontmost of p to true
  key code 36
end tell
OSA
}

assert_export_file() {
  step "assert export file on disk"
  python3 - "$ARTIFACT_DIR/ui-result.json" "$ACCEPTANCE_HOME" <<'PY' || fail "export file missing or empty"
import json, sys, os
from pathlib import Path
marker = json.loads(Path(sys.argv[1]).read_text())
home = Path(sys.argv[2])
assert marker.get("exportCompleted") is True, marker
assert int(marker.get("exportBytes") or 0) > 0, marker
exported = marker.get("exportedPath") or ""
candidates = []
if exported:
    candidates.append(Path(exported))
candidates.extend(home.glob("**/_acceptance/exports/*"))
found = None
for p in candidates:
    if p.is_file() and p.stat().st_size > 0:
        found = p
        break
assert found is not None, f"no non-empty export file; marker={marker}"
print("export ok", found, "bytes", found.stat().st_size)
PY
}

launch_app
choose_pdf_via_open_panel

step "wait library card"
wait_ui_step "ui_library_card_visible" 180

step "open paper card"
ax_click_by_label "論文" || ax_click_by_label "Acceptance" || true
sleep 2
wait_ui_step "ui_reader_visible" 120

if [[ "${PAPER_READER_UI_E2E_SMOKE_ONLY:-0}" == "1" ]]; then
  step "reader smoke verified"
  python3 - "$ARTIFACT_DIR/ui-result.json" <<'PY' || fail "reader smoke marker failed"
import json, sys
data = json.load(open(sys.argv[1]))
assert data.get("ok") is True, data
assert data.get("step") == "ui_reader_smoke_ready", data
print("reader smoke ok", data.get("paperTitleHint"))
PY
  quit_app
  step "done"
  echo "OK packaged UI E2E reader smoke. Artifacts: $ARTIFACT_DIR" | tee -a "$LOG_FILE"
  exit 0
fi

step "save memo via UI"
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

step "open export UI and run export"
ax_click_by_label "書き出す" || true
sleep 1
ax_click_by_label "書き出しを実行" || true
# Prefer the confirm control inside the dialog
ax_click_by_label "書き出す" || true
wait_ui_step "ui_export_completed" 90
assert_export_file

wait_ui_step "ui_core_flow_ready" 30

quit_app
launch_app
step "relaunch: open paper and require annotation mark in Reader UI"
sleep 5
wait_ui_step "ui_library_card_visible" 120
ax_click_by_label "論文" || ax_click_by_label "Acceptance" || true
sleep 3
wait_ui_step "ui_relaunch_annotation_visible" 120

python3 - "$ARTIFACT_DIR/ui-result.json" <<'PY' || fail "relaunch annotation assert failed"
import json, sys
data = json.load(open(sys.argv[1]))
assert data.get("phase") == "relaunch", data
assert data.get("annotationVisible") is True, data
assert data.get("step") == "ui_relaunch_annotation_visible", data
assert data.get("ok") is True, data
print("relaunch annotation ok", data.get("paperTitleHint"))
PY

quit_app

step "done"
echo "OK packaged UI E2E (export + relaunch annotation). Artifacts: $ARTIFACT_DIR" | tee -a "$LOG_FILE"
