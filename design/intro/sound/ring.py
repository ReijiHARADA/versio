# Add a steel resonance to the cleaned take: convolve it with a modal (inharmonic decaying sines) IR, plus a short room.
import os, wave, sys, numpy as np
src, tick_path, out = sys.argv[-3], sys.argv[-2], sys.argv[-1]
w = wave.open(src); sr = w.getframerate(); a = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(float) / 32768
# 2nd-stage onset: layer the separately recorded crisp tick (stage2-tick.wav) onto the snap, peaks aligned
tw = wave.open(tick_path); tick = np.frombuffer(tw.readframes(tw.getnframes()), np.int16).astype(float) / 32768
i0, i1 = int(sr * 0.33), int(sr * 0.40); sp = i0 + int(np.argmax(np.abs(a[i0:i1]))); tp = int(np.argmax(np.abs(tick)))
st = sp - tp; seg = tick[: len(a) - st] * (float(os.environ.get("TICK_GAIN", "0.8")) * np.max(np.abs(a[i0:i1])) / np.max(np.abs(tick)))
a = a.copy(); a[st: st + len(seg)] += seg
# hold after the snap: the video keeps the base pressed 8 frames longer than the take, so open a gap before the release
k = int(sr * 0.60); a = np.concatenate([a[:k], np.zeros(int(sr * 8 / 30)), a[k:]])
t = np.arange(int(sr * 0.6)) / sr
modes = [(2350, .14, 1.0), (3870, .10, .5), (1180, .10, .4)]
ir = sum(g * np.sin(2 * np.pi * f * t) * np.exp(-t / d) for f, d, g in modes)
# ring only from the snap (2nd stage, 0.347 s): a faint steel tail after the clinch, nothing on the first click
snap = np.zeros_like(a); i0, i1 = int(sr * 0.33), int(sr * 0.40); snap[i0:i1] = a[i0:i1]
ring = np.convolve(snap, ir)[: len(a) + len(t)]
ring *= np.max(np.abs(snap)) / np.max(np.abs(ring))
rng = np.random.default_rng(3); rt = np.arange(int(sr * 0.35)) / sr
room = rng.standard_normal(len(rt)) * np.exp(-rt / 0.07); room[0] = 0
rev = np.pad(np.convolve(a, room), (0, len(ring)))[: len(ring)]; rev *= np.max(np.abs(a)) / np.max(np.abs(rev))
dry = np.pad(a, (0, len(ring) - len(a)))
mix = dry + 0.07 * ring + 0.06 * rev  # faint: a stronger or full-length ring read as too metallic
fade = int(sr * 0.25); mix[-fade:] *= np.linspace(1, 0, fade) ** 2
mix *= 10 ** (-1 / 20) / np.max(np.abs(mix))  # peak -1 dBFS
o = wave.open(out, "w"); o.setnchannels(1); o.setsampwidth(2); o.setframerate(sr)
o.writeframes((mix * 32767).astype(np.int16).tobytes())
