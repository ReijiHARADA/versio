#!/usr/bin/env bash
# Sign + notarize Versio.app, then build DMG from the signed app and
# sign/notarize the DMG. Never runs on tauri:build:fast.
#
# Correct order:
#   signed nested Mach-O → signed .app → verify → notarize → staple → spctl
#   → DMG from that .app → sign/notarize/staple DMG → verify DMG (+ mounted .app)
#
# Required env (do not commit secrets):
#   APPLE_SIGNING_IDENTITY
#   APPLE_ID + APPLE_TEAM_ID + APPLE_APP_SPECIFIC_PASSWORD
#   or APPLE_NOTARY_PROFILE
#
# See docs/MACOS_RELEASE.md

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_PATH="${VERSIO_APP_PATH:-$ROOT/src-tauri/target/release/bundle/macos/Versio.app}"
DMG_DIR="${VERSIO_DMG_DIR:-$ROOT/src-tauri/target/release/bundle/dmg}"
DMG_NAME="${VERSIO_DMG_NAME:-Versio_$(node -p "require('$ROOT/src-tauri/tauri.conf.json').version")_aarch64.dmg}"
DMG_PATH="${VERSIO_DMG_PATH:-$DMG_DIR/$DMG_NAME}"
ENTITLEMENTS="${VERSIO_ENTITLEMENTS:-$ROOT/src-tauri/entitlements.plist}"
SKIP_DMG="${VERSIO_SKIP_DMG:-0}"

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

if [[ ! -f "$ENTITLEMENTS" ]]; then
  echo "Entitlements missing: $ENTITLEMENTS"
  exit 1
fi

notary_submit() {
  local artifact="$1"
  if [[ -n "${APPLE_NOTARY_PROFILE:-}" ]]; then
    xcrun notarytool submit "$artifact" --keychain-profile "$APPLE_NOTARY_PROFILE" --wait
  elif [[ -n "${APPLE_ID:-}" && -n "${APPLE_TEAM_ID:-}" && -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" ]]; then
    xcrun notarytool submit "$artifact" \
      --apple-id "$APPLE_ID" \
      --team-id "$APPLE_TEAM_ID" \
      --password "$APPLE_APP_SPECIFIC_PASSWORD" \
      --wait
  else
    echo "Set APPLE_NOTARY_PROFILE or APPLE_ID + APPLE_TEAM_ID + APPLE_APP_SPECIFIC_PASSWORD"
    exit 1
  fi
}

verify_app() {
  local target="$1"
  echo "== verify .app: $target =="
  codesign --verify --deep --strict --verbose=2 "$target"
  xcrun stapler validate "$target"
  spctl --assess --type execute --verbose=4 "$target"
}

echo "== codesign nested Mach-O (fail on any error) =="
# Deepest paths first so nested helpers are signed before parents.
while IFS= read -r bin; do
  [[ -z "$bin" ]] && continue
  if ! file "$bin" | grep -q 'Mach-O'; then
    continue
  fi
  echo "  signing: $bin"
  codesign --force --options runtime --timestamp \
    --entitlements "$ENTITLEMENTS" \
    --sign "$APPLE_SIGNING_IDENTITY" \
    "$bin"
done < <(
  find "$APP_PATH/Contents" -type f \( -name '*.dylib' -o -name '*.so' -o -perm +111 \) 2>/dev/null \
    | awk '{ print length($0), $0 }' \
    | sort -nr \
    | cut -d' ' -f2-
)

echo "== codesign .app bundle =="
codesign --force --deep --options runtime --timestamp \
  --entitlements "$ENTITLEMENTS" \
  --sign "$APPLE_SIGNING_IDENTITY" \
  "$APP_PATH"

echo "== codesign --verify (.app, pre-notarize) =="
codesign --verify --deep --strict --verbose=2 "$APP_PATH"

echo "== notarize .app =="
ZIP_PATH="${TMPDIR:-/tmp}/Versio-notarize-$$.zip"
ditto -c -k --keepParent "$APP_PATH" "$ZIP_PATH"
notary_submit "$ZIP_PATH"
rm -f "$ZIP_PATH"

echo "== staple .app =="
xcrun stapler staple "$APP_PATH"
verify_app "$APP_PATH"

if [[ "$SKIP_DMG" == "1" ]]; then
  echo "SKIP_DMG=1 — not building DMG"
  echo "OK signed + notarized + stapled app only"
  echo "  app: $APP_PATH"
  exit 0
fi

echo "== build DMG from signed .app =="
# Remove any previously generated (possibly unsigned) DMG first.
rm -f "$DMG_PATH"
VERSIO_APP_PATH="$APP_PATH" \
VERSIO_DMG_PATH="$DMG_PATH" \
  bash "$ROOT/scripts/macos-build-dmg.sh"

echo "== sign + notarize + staple .dmg =="
codesign --force --timestamp --sign "$APPLE_SIGNING_IDENTITY" "$DMG_PATH"
notary_submit "$DMG_PATH"
xcrun stapler staple "$DMG_PATH"
xcrun stapler validate "$DMG_PATH"
codesign --verify --verbose=2 "$DMG_PATH"
# Gatekeeper open assessment for disk images (best-effort on CI images).
spctl --assess --type open --context context:primary-signature --verbose=4 "$DMG_PATH" \
  || spctl --assess --type install --verbose=4 "$DMG_PATH"

echo "== verify .app inside mounted DMG =="
ATTACH_OUT="$(hdiutil attach "$DMG_PATH" -nobrowse -readonly -mountrandom "${TMPDIR:-/tmp}")"
MOUNT_POINT="$(echo "$ATTACH_OUT" | awk '/\/Volumes\// {print $3; exit}')"
if [[ -z "$MOUNT_POINT" ]]; then
  # -mountrandom prints the mount path in the last column
  MOUNT_POINT="$(echo "$ATTACH_OUT" | awk 'NF{print $NF}' | tail -1)"
fi
INNER_APP="$(find "$MOUNT_POINT" -maxdepth 2 -name '*.app' -type d | head -1 || true)"
if [[ -z "$INNER_APP" || ! -d "$INNER_APP" ]]; then
  hdiutil detach "$MOUNT_POINT" -quiet || true
  echo "No .app found inside DMG mount: $MOUNT_POINT"
  exit 1
fi
codesign --verify --deep --strict --verbose=2 "$INNER_APP"
spctl --assess --type execute --verbose=4 "$INNER_APP"
hdiutil detach "$MOUNT_POINT" -quiet

echo "OK signed + notarized + stapled"
echo "  app: $APP_PATH"
echo "  dmg: $DMG_PATH"
