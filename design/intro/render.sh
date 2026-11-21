#!/usr/bin/env bash
# Render the first-launch intro to src/assets/intro/{intro.mp4,final.png}.
#   PREVIEW=1 design/intro/render.sh <out_dir>   quick low-res check (~minutes) before the full render (~20 min)
# Static stretches (blank sheet before frame 10, final mark after frame 78) are rendered once and duplicated.
# An interrupted render resumes when TMP points at the previous frame directory.
set -euo pipefail
cd "$(dirname "$0")/../.."
B=/Applications/Blender.app/Contents/MacOS/Blender
if [[ -n "${PREVIEW:-}" ]]; then RES=${RES:-640}; SAMPLES=${SAMPLES:-8}; OUT=${1:?out dir}
else RES=${RES:-1600}; SAMPLES=${SAMPLES:-64}; OUT=src/assets/intro; fi
TMP=${TMP:-$(mktemp -d)}; mkdir -p "$OUT"
"$B" -b -P design/intro/stapler_intro.py -- "$TMP" "$RES" "$SAMPLES" 10 78 >/dev/null
"$B" -b -P design/intro/stapler_intro.py -- "$TMP" "$RES" "$SAMPLES" 90 90 >/dev/null
for i in $(seq 1 9); do cp "$TMP/f_0010.png" "$TMP/$(printf f_%04d.png "$i")"; done
for i in $(seq 79 89); do cp "$TMP/f_0090.png" "$TMP/$(printf f_%04d.png "$i")"; done
ffmpeg -loglevel error -y -framerate 30 -i "$TMP/f_%04d.png" -c:v libx264 -preset slow -crf 22 \
  -pix_fmt yuv420p -movflags +faststart "$OUT/intro.mp4"
cp "$TMP/f_0090.png" "$OUT/final.png"
rm -rf "$TMP"; ls -l "$OUT"
