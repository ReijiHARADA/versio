#!/usr/bin/env bash
set -euo pipefail

APP_PATH="${1:-src-tauri/target/release/bundle/macos/Paper Reader.app}"
SERVER_ROOT="$APP_PATH/Contents/Resources/translation-server"
ENGINE="$SERVER_ROOT/engines/madlad_mps.py"

[[ -f "$ENGINE" ]] || { echo "missing bundled engine: $ENGINE" >&2; exit 1; }
echo "bundle: $APP_PATH"
stat -f 'updated: %Sm' -t '%Y-%m-%d %H:%M:%S' "$APP_PATH"
rg -n 'strict-restore-v[0-9]+|MAX_NEW_TOKENS = ' "$ENGINE"
echo "running processes:"
ps -axo pid,lstart,command | rg "$SERVER_ROOT/server.py" || true

