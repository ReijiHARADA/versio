#!/usr/bin/env bash
# Sign + notarize a packaged Paper Reader.app (Developer ID distribution).
# Does NOT run on tauri:build:fast. Call after clean release build, or via:
#   PAPER_READER_SIGN=1 npm run tauri:build:clean
#
# Required env (do not commit secrets):
#   APPLE_SIGNING_IDENTITY   e.g. "Developer ID Application: Name (TEAMID)"
#   APPLE_ID                 Apple ID email
#   APPLE_TEAM_ID            10-char Team ID
#   APPLE_APP_SPECIFIC_PASSWORD
# Optional:
#   APPLE_NOTARY_PROFILE     keychain profile (skips APPLE_ID/password if set)
#   PAPER_READER_APP_PATH    path to .app
#   PAPER_READER_DMG_PATH    path to .dmg (stapled when present)
#
# See docs/MACOS_RELEASE.md

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_PATH="${PAPER_READER_APP_PATH:-$ROOT/src-tauri/target/release/bundle/macos/Paper Reader.app}"
DMG_PATH="${PAPER_READER_DMG_PATH:-$ROOT/src-tauri/target/release/bundle/dmg/Paper Reader_0.1.0_aarch64.dmg}"
ENTITLEMENTS="${PAPER_READER_ENTITLEMENTS:-$ROOT/src-tauri/entitlements.plist}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Signing requires macOS"
  exit 1
fi

if [[ ! -d "$APP_PATH" ]]; then
  echo "App not found: $APP_PATH"
  exit 1
fi

if [[ -z "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  echo "Set APPLE_SIGNING_IDENTITY (Developer ID Application: ...)"
  exit 1
fi

echo "== codesign (hardened runtime) =="
# Sign nested binaries deepest-first, then the .app bundle.
find "$APP_PATH/Contents" -type f \( -name '*.dylib' -o -name '*.so' -o -perm +111 \) 2>/dev/null \
  | while read -r bin; do
      # Skip Info.plist-like non-mach-o files that happen to be executable bits.
      if file "$bin" | grep -q 'Mach-O'; then
        codesign --force --options runtime --timestamp \
          --entitlements "$ENTITLEMENTS" \
          --sign "$APPLE_SIGNING_IDENTITY" \
          "$bin" || true
      fi
    done

codesign --force --deep --options runtime --timestamp \
  --entitlements "$ENTITLEMENTS" \
  --sign "$APPLE_SIGNING_IDENTITY" \
  "$APP_PATH"

echo "== codesign --verify =="
codesign --verify --deep --strict --verbose=2 "$APP_PATH"

echo "== notarize =="
ZIP_PATH="${TMPDIR:-/tmp}/PaperReader-notarize-$$.zip"
ditto -c -k --keepParent "$APP_PATH" "$ZIP_PATH"

if [[ -n "${APPLE_NOTARY_PROFILE:-}" ]]; then
  xcrun notarytool submit "$ZIP_PATH" --keychain-profile "$APPLE_NOTARY_PROFILE" --wait
elif [[ -n "${APPLE_ID:-}" && -n "${APPLE_TEAM_ID:-}" && -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" ]]; then
  xcrun notarytool submit "$ZIP_PATH" \
    --apple-id "$APPLE_ID" \
    --team-id "$APPLE_TEAM_ID" \
    --password "$APPLE_APP_SPECIFIC_PASSWORD" \
    --wait
else
  echo "Set APPLE_NOTARY_PROFILE or APPLE_ID + APPLE_TEAM_ID + APPLE_APP_SPECIFIC_PASSWORD"
  rm -f "$ZIP_PATH"
  exit 1
fi

rm -f "$ZIP_PATH"

echo "== staple .app =="
xcrun stapler staple "$APP_PATH"
xcrun stapler validate "$APP_PATH"

echo "== spctl assess =="
spctl --assess --type execute --verbose=4 "$APP_PATH" || {
  echo "spctl assess reported an issue (Gatekeeper). Investigate before distribution."
  exit 1
}

if [[ -f "$DMG_PATH" ]]; then
  echo "== sign + notarize + staple .dmg =="
  codesign --force --timestamp --sign "$APPLE_SIGNING_IDENTITY" "$DMG_PATH"
  if [[ -n "${APPLE_NOTARY_PROFILE:-}" ]]; then
    xcrun notarytool submit "$DMG_PATH" --keychain-profile "$APPLE_NOTARY_PROFILE" --wait
  else
    xcrun notarytool submit "$DMG_PATH" \
      --apple-id "$APPLE_ID" \
      --team-id "$APPLE_TEAM_ID" \
      --password "$APPLE_APP_SPECIFIC_PASSWORD" \
      --wait
  fi
  xcrun stapler staple "$DMG_PATH"
  xcrun stapler validate "$DMG_PATH"
fi

echo "OK signed + notarized + stapled"
echo "  app: $APP_PATH"
[[ -f "$DMG_PATH" ]] && echo "  dmg: $DMG_PATH"
