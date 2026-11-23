#!/usr/bin/env bash
# Publish the built Versio.app as a GitHub Release that the in-app updater
# picks up (tauri-plugin-updater reads releases/latest/download/latest.json).
#
# Run after `npm run tauri:build:clean` (with VERSIO_SIGN=1 for a notarized
# release) and after bumping "version" in src-tauri/tauri.conf.json.
#
#   bash scripts/macos-publish-update.sh            # build artifacts only
#   bash scripts/macos-publish-update.sh --publish  # also create the release
#
# Env: VERSIO_UPDATER_KEY (default ~/.tauri/versio-updater.key, never commit),
#      VERSIO_UPDATER_KEY_PASSWORD (default empty), VERSIO_RELEASE_NOTES,
#      VERSIO_RELEASE_DRAFT=1 (create the release as a draft).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
KEY="${VERSIO_UPDATER_KEY:-$HOME/.tauri/versio-updater.key}"
REPO="ReijiHARADA/versio"
VERSION="$(node -p 'require("./src-tauri/tauri.conf.json").version')"
TAG="v$VERSION"
APP_DIR="src-tauri/target/release/bundle/macos"
OUT="src-tauri/target/release/bundle/updater"
ARCHIVE="Versio_${VERSION}_aarch64.app.tar.gz"

[[ -d "$APP_DIR/Versio.app" ]] || { echo "Missing $APP_DIR/Versio.app (build first)"; exit 1; }
[[ -f "$KEY" ]] || { echo "Missing updater key: $KEY"; exit 1; }
if gh release view "$TAG" -R "$REPO" >/dev/null 2>&1; then
  echo "Release $TAG already exists; bump the version in src-tauri/tauri.conf.json"; exit 1
fi

rm -rf "$OUT" && mkdir -p "$OUT"
# No AppleDouble `._*` entries: the updater refuses to unpack them.
COPYFILE_DISABLE=1 tar --no-mac-metadata -czf "$OUT/$ARCHIVE" -C "$APP_DIR" Versio.app
npx tauri signer sign -f "$KEY" -p "${VERSIO_UPDATER_KEY_PASSWORD:-}" "$OUT/$ARCHIVE" >/dev/null
SIG="$(cat "$OUT/$ARCHIVE.sig")"

node -e '
const [version, sig, url, notes] = process.argv.slice(1);
console.log(JSON.stringify({
  version, notes, pub_date: new Date().toISOString(),
  platforms: { "darwin-aarch64": { signature: sig, url } },
}, null, 2));
' "$VERSION" "$SIG" "https://github.com/$REPO/releases/download/$TAG/$ARCHIVE" "${VERSIO_RELEASE_NOTES:-}" >"$OUT/latest.json"

echo "Updater artifacts: $OUT"
if [[ "${1:-}" == "--publish" ]]; then
  assets=("$OUT/$ARCHIVE" "$OUT/latest.json")
  dmg="src-tauri/target/release/bundle/dmg/Versio_${VERSION}_aarch64.dmg"
  [[ -f "$dmg" ]] && assets+=("$dmg")
  draft=()
  [[ "${VERSIO_RELEASE_DRAFT:-}" == "1" ]] && draft=(--draft)
  gh release create "$TAG" -R "$REPO" ${draft[@]+"${draft[@]}"} --title "Versio $VERSION" --notes "${VERSIO_RELEASE_NOTES:-}" "${assets[@]}"
fi
