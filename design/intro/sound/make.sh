#!/usr/bin/env bash
# Build src/assets/intro/staple.wav from the recorded take (one two-stage press: click 0.083 s, snap 0.347 s,
# release ~0.72 s): denoise + EQ, layer the crisp 2nd-stage tick (stage2-tick.wav, a separate recording), then ring.py adds a short room (plus a faint steel ring after the snap only), peak -1 dBFS.
set -euo pipefail
cd "$(dirname "$0")"; TMP=$(mktemp -d)
PY=/Applications/Blender.app/Contents/Resources/4.3/python/bin/python3.11  # ships numpy
ffmpeg -loglevel error -y -i staple-take.wav -af "highpass=f=70,lowpass=f=16000,afftdn=nf=-55,equalizer=f=160:t=q:w=1:g=2,equalizer=f=4200:t=q:w=1.2:g=-2" -ar 48000 "$TMP/clean.wav"
ffmpeg -loglevel error -y -i stage2-tick.wav -af "highpass=f=70,afftdn=nf=-55" -ar 48000 "$TMP/tick.wav"
"$PY" ring.py "$TMP/clean.wav" "$TMP/tick.wav" "$TMP/final.wav"
# 16-bit WAV: no codec priming, so the click times measured on this file hold in every player
ffmpeg -loglevel error -y -i "$TMP/final.wav" -c:a pcm_s16le ../../../src/assets/intro/staple.wav
rm -rf "$TMP"
