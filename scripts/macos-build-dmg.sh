#!/usr/bin/env bash
# Create a .dmg from an existing Versio.app (no Tauri rebuild).
# Used after the .app is finalized (unsigned clean, or signed+stapled).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_PATH="${VERSIO_APP_PATH:-$ROOT/src-tauri/target/release/bundle/macos/Versio.app}"
DMG_DIR="${VERSIO_DMG_DIR:-$ROOT/src-tauri/target/release/bundle/dmg}"
DMG_NAME="${VERSIO_DMG_NAME:-Versio_0.1.0_aarch64.dmg}"
DMG_PATH="${VERSIO_DMG_PATH:-$DMG_DIR/$DMG_NAME}"
VOL_NAME="${VERSIO_DMG_VOLUME:-Versio}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "DMG creation requires macOS"
  exit 1
fi

if [[ ! -d "$APP_PATH" ]]; then
  echo "App not found: $APP_PATH"
  exit 1
fi

mkdir -p "$DMG_DIR"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/versio-dmg.XXXXXX")"
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

# Stage a clean folder containing only the .app (and Applications link).
cp -R "$APP_PATH" "$STAGE/Versio.app"
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
