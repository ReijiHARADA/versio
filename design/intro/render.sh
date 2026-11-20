#!/usr/bin/env bash
# Render the first-launch intro to src/assets/intro/{intro.mp4,final.png}.
# Static stretches (blank sheet, final mark) are rendered once and duplicated.
set -euo pipefail
cd "$(dirname "$0")/../.."
B=/Applications/Blender.app/Contents/MacOS/Blender
TMP=${TMP:-$(mktemp -d)}; OUT=src/assets/intro; mkdir -p "$OUT"
RES=${RES:-1600}; SAMPLES=${SAMPLES:-64}
"$B" -b -P design/intro/stapler_intro.py -- "$TMP" "$RES" "$SAMPLES" 12 56 >/dev/null
"$B" -b -P design/intro/stapler_intro.py -- "$TMP" "$RES" "$SAMPLES" 90 90 >/dev/null
for i in $(seq 1 11); do cp "$TMP/f_0012.png" "$TMP/$(printf f_%04d.png "$i")"; done
for i in $(seq 57 89); do cp "$TMP/f_0090.png" "$TMP/$(printf f_%04d.png "$i")"; done
ffmpeg -loglevel error -y -framerate 30 -i "$TMP/f_%04d.png" -c:v libx264 -preset slow -crf 22 \
  -pix_fmt yuv420p -movflags +faststart "$OUT/intro.mp4"
cp "$TMP/f_0090.png" "$OUT/final.png"
rm -rf "$TMP"; ls -l "$OUT"
