#!/usr/bin/env bash
# Create a .dmg from an existing Paper Reader.app (no Tauri rebuild).
# Used after the .app is finalized (unsigned clean, or signed+stapled).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_PATH="${PAPER_READER_APP_PATH:-$ROOT/src-tauri/target/release/bundle/macos/Paper Reader.app}"
DMG_DIR="${PAPER_READER_DMG_DIR:-$ROOT/src-tauri/target/release/bundle/dmg}"
DMG_NAME="${PAPER_READER_DMG_NAME:-Paper Reader_0.1.0_aarch64.dmg}"
DMG_PATH="${PAPER_READER_DMG_PATH:-$DMG_DIR/$DMG_NAME}"
VOL_NAME="${PAPER_READER_DMG_VOLUME:-Paper Reader}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "DMG creation requires macOS"
  exit 1
fi

if [[ ! -d "$APP_PATH" ]]; then
  echo "App not found: $APP_PATH"
  exit 1
fi

mkdir -p "$DMG_DIR"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/paper-reader-dmg.XXXXXX")"
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

# Stage a clean folder containing only the .app (and Applications link).
cp -R "$APP_PATH" "$STAGE/Paper Reader.app"
ln -s /Applications "$STAGE/Applications"

rm -f "$DMG_PATH"
hdiutil create \
  -volname "$VOL_NAME" \
  -srcfolder "$STAGE" \
  -ov \
  -format UDZO \
  -fs HFS+ \
  "$DMG_PATH"

echo "OK dmg: $DMG_PATH"
echo "  source app: $APP_PATH"
