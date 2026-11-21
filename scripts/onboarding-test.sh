#!/usr/bin/env bash
# Onboarding test app: a separate "Versio Onboarding" identity whose data is wiped on every run,
# so each launch is a true first install (intro animation, Introduction paper, PLaMo screen).
# The PLaMo model is hard-linked from the everyday Versio, so nothing is downloaded again.
#
#   npm run onboarding:test           reset the test data and open the test app (builds it if missing)
#   npm run onboarding:test -- build  rebuild the test app from this checkout first
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ID="com.harada.versio.onboarding"
NAME="Versio Onboarding"
APP="$ROOT/src-tauri/target/release/bundle/macos/$NAME.app"
DATA="$HOME/Library/Application Support/$ID"
MODEL_SRC="$HOME/Library/Application Support/com.harada.versio/models/plamo-3-translate-2b-Q4_K_M.gguf"

if [[ "${1:-}" == "build" || ! -d "$APP" ]]; then
  (cd "$ROOT" && VITE_VERSIO_ONBOARDING_PREVIEW=1 \
    VERSIO_TAURI_CONFIG="{\"identifier\":\"$ID\",\"productName\":\"$NAME\"}" \
    bash scripts/tauri-build.sh fast)
fi

# quit a running test app (and its sidecar) before wiping its data; the everyday Versio is untouched
pkill -f "$APP/Contents/MacOS/" 2>/dev/null || true
sleep 1

rm -rf "$DATA" "$HOME/Library/WebKit/$ID" "$HOME/Library/Caches/$ID" "$HOME/Library/HTTPStorages/$ID" \
  "$HOME/Library/Saved Application State/$ID.savedState"
defaults delete "$ID" >/dev/null 2>&1 || true

mkdir -p "$DATA/models"
if [[ -f "$MODEL_SRC" ]]; then
  ln "$MODEL_SRC" "$DATA/models/" # hard link: no extra disk, no re-download
else
  echo "onboarding-test: no PLaMo model in the everyday Versio; the test app will offer the real download." >&2
fi

open -n "$APP"
echo "onboarding-test: opened $NAME with fresh data ($DATA)"
