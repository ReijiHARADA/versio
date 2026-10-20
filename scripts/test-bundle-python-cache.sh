#!/usr/bin/env bash
# Smoke test for Python runtime content-hash cache (no Tauri / no DMG).
# Does not force a full torch reinstall — uses --check-only for invalidation.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== bundle-python cache smoke =="

# Ensure a valid cached venv exists (rebuild only if needed).
bash scripts/bundle-python.sh cache >/tmp/paper-reader-bundle-python-1.log
tail -15 /tmp/paper-reader-bundle-python-1.log

out2="$(bash scripts/bundle-python.sh cache 2>&1)"
echo "$out2" | tail -8
if ! echo "$out2" | grep -q "Reusing cached venv"; then
  echo "FAIL: second cache run should reuse venv"
  exit 1
fi
if ! echo "$out2" | grep -q "PAPER_READER_PYTHON_REBUILT=0"; then
  echo "FAIL: expected PAPER_READER_PYTHON_REBUILT=0"
  exit 1
fi

if ! bash scripts/bundle-python.sh --check-only; then
  echo "FAIL: --check-only should pass on valid cache"
  exit 1
fi

stamp="translation-server/venv/.paper-reader-bundle-hash"
cp "$stamp" "$stamp.bak"
echo "deadbeef" >"$stamp"
set +e
bash scripts/bundle-python.sh --check-only >/tmp/paper-reader-bundle-check.log 2>&1
check_rc=$?
set -e
mv "$stamp.bak" "$stamp"
if [[ "$check_rc" -eq 0 ]]; then
  echo "FAIL: --check-only should fail with corrupt stamp"
  cat /tmp/paper-reader-bundle-check.log
  exit 1
fi
if ! grep -q "cache invalid" /tmp/paper-reader-bundle-check.log; then
  echo "FAIL: expected cache invalid message"
  cat /tmp/paper-reader-bundle-check.log
  exit 1
fi

# Restore validity
bash scripts/bundle-python.sh --check-only

bash scripts/stage-translation-bundle.sh
stage="src-tauri/bundled-resources/translation-server"
venv_stage="src-tauri/bundled-resources/translation-venv"
for bad in models .venv .venv-mlx tests benchmarks venv; do
  if [[ -e "$stage/$bad" ]]; then
    echo "FAIL: staged lite bundle contains $bad"
    exit 1
  fi
done
if [[ ! -f "$stage/server.py" || ! -f "$stage/.paper-reader-venv-external" ]]; then
  echo "FAIL: staged lite bundle incomplete"
  exit 1
fi
if [[ ! -x "$venv_stage/bin/python3" ]]; then
  echo "FAIL: staged translation-venv incomplete"
  exit 1
fi

echo "OK bundle-python cache + stage smoke"
