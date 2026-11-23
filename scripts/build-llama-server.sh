#!/usr/bin/env bash
# Build a static, Metal-embedded llama-server for the Tauri sidecar (pinned llama.cpp tag).
set -euo pipefail
TAG=b12110
COMMIT=cd959bae99ff4bed22bef2604f45241c09bbb8c8
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/.cache/llama.cpp"
OUT_DIR="$ROOT/src-tauri/binaries"
OUT="$OUT_DIR/llama-server-aarch64-apple-darwin"

if [[ -x "$OUT" && "$(cat "$OUT_DIR/.llama-tag" 2>/dev/null)" == "$TAG" ]]; then
  echo "llama-server $TAG already built"; exit 0
fi
if [[ ! -d "$SRC/.git" ]]; then
  git clone --quiet --depth 1 --branch "$TAG" https://github.com/ggml-org/llama.cpp "$SRC"
fi
[[ "$(git -C "$SRC" rev-parse HEAD)" == "$COMMIT" ]] || { echo "llama.cpp HEAD is not $COMMIT" >&2; exit 1; }

cmake -S "$SRC" -B "$SRC/build" -DBUILD_SHARED_LIBS=OFF -DGGML_METAL=ON -DGGML_METAL_EMBED_LIBRARY=ON \
  -DLLAMA_USE_PREBUILT_UI=OFF -DLLAMA_BUILD_UI=OFF -DLLAMA_CURL=OFF -DLLAMA_OPENSSL=OFF -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF \
  -DCMAKE_BUILD_TYPE=Release >/dev/null
cmake --build "$SRC/build" --target llama-server -j >/dev/null

mkdir -p "$OUT_DIR"
cp "$SRC/build/bin/llama-server" "$OUT"
if otool -L "$OUT" | tail -n +2 | grep -vqE '^\s*(/usr/lib|/System)'; then
  echo "llama-server links non-system libraries:" >&2; otool -L "$OUT" >&2; exit 1
fi
echo "$TAG" > "$OUT_DIR/.llama-tag"
echo "built $OUT"
