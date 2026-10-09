#!/bin/bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
if [[ "$(uname -s)" != "Darwin" || ! -d "/Applications/Xcode-beta.app/Contents/Developer" ]]; then
  exit 0
fi
mkdir -p "$PROJECT_DIR/src-tauri/bundled-resources"
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer \
  xcrun swiftc -parse-as-library "$PROJECT_DIR/src-tauri/apple_translation.swift" \
    -o "$PROJECT_DIR/src-tauri/bundled-resources/apple-translation" -framework Translation
chmod +x "$PROJECT_DIR/src-tauri/bundled-resources/apple-translation"
echo "Apple Translation helper compiled"
