#!/usr/bin/env bash
# Build Versio from main and install it as the single everyday copy at /Applications/Versio.app.
# Worktree builds stay disposable; this is the one Launch Services should open.
set -euo pipefail
cd "$(dirname "$0")/.."

DEST=/Applications/Versio.app
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister

branch=$(git rev-parse --abbrev-ref HEAD)
if [[ "$branch" != "main" && "${ALLOW_BRANCH:-}" != "1" ]]; then
  echo "install-app: on '$branch', not main. Switch to main (or ALLOW_BRANCH=1)." >&2
  exit 1
fi

# Replacing a running bundle confuses macOS; ask the user to quit first.
if pgrep -f "Versio.app/Contents/MacOS/app" >/dev/null; then
  echo "install-app: Versio is running. Quit it first:" >&2
  pgrep -lf "Versio.app/Contents/MacOS/app" >&2
  exit 1
fi

bash scripts/tauri-build.sh fast
SRC=src-tauri/target/release/bundle/macos/Versio.app

rm -rf "$DEST.tmp"
ditto "$SRC" "$DEST.tmp"
rm -rf "$DEST"
mv "$DEST.tmp" "$DEST"
"$LSREGISTER" -f "$DEST"
echo "install-app: installed $(git rev-parse --short HEAD) to $DEST"
