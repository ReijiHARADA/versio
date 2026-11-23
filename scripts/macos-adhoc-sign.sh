#!/usr/bin/env bash
# Ad-hoc sign Versio.app for unsigned (no Developer ID) distribution.
# The Tauri bundle is only linker-signed, so a downloaded copy is reported as
# "damaged" by Gatekeeper. Sealing the bundle ad hoc lets users open it via
# System Settings → Privacy & Security → "Open Anyway" instead.
# This is NOT a Developer ID signature and is never notarized.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_PATH="${VERSIO_APP_PATH:-$ROOT/src-tauri/target/release/bundle/macos/Versio.app}"
ENTITLEMENTS="$ROOT/src-tauri/entitlements.plist"

[[ -d "$APP_PATH" ]] || { echo "App not found: $APP_PATH"; exit 1; }

# Nested Mach-O first (deepest path first), then the bundle.
while IFS= read -r bin; do
  [[ -z "$bin" ]] && continue
  file "$bin" | grep -q 'Mach-O' || continue
  codesign --force --sign - --entitlements "$ENTITLEMENTS" "$bin"
done < <(
  find "$APP_PATH/Contents" -type f \( -name '*.dylib' -o -name '*.so' -o -perm +111 \) 2>/dev/null \
    | awk '{ print length($0), $0 }' | sort -nr | cut -d' ' -f2-
)
codesign --force --sign - --entitlements "$ENTITLEMENTS" "$APP_PATH"
codesign --verify --deep --strict --verbose=2 "$APP_PATH"
echo "OK ad-hoc signed: $APP_PATH"
