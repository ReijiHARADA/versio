#!/usr/bin/env bash
# Compile the Icon Composer icon (light/dark) into src-tauri/icons/Assets.car.
# Run after editing src-tauri/icons/AppIcon.icon. The bundler takes the .car as-is,
# so builds never call actool (whose ibtoold daemon is flaky when spawned by the bundler).
set -euo pipefail
cd "$(dirname "$0")/.."
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode-beta.app/Contents/Developer}"
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
for attempt in 1 2; do
  xcrun actool "$PWD/src-tauri/icons/AppIcon.icon" --compile "$out" --output-format human-readable-text \
    --output-partial-info-plist "$out/p.plist" --app-icon AppIcon --include-all-app-icons \
    --platform macosx --minimum-deployment-target 11.0 --target-device mac >/dev/null 2>&1 || true
  [[ -f "$out/Assets.car" ]] && break
  pkill -9 -f "ibtoold --sending-client-environment" 2>/dev/null || true  # stuck daemon ignores SIGTERM
  sleep 1
done
[[ -f "$out/Assets.car" ]] || { echo "build-icon-car: actool produced no Assets.car" >&2; exit 1; }
cp "$out/Assets.car" src-tauri/icons/Assets.car
echo "build-icon-car: wrote src-tauri/icons/Assets.car"
