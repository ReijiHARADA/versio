// Synthesised "snap" for the clinch. shortcut: placeholder until a recorded staple sound is supplied;
// swap the body for `new Audio(url).play()` then.
export function playStapleSound(): void {
  try {
    const ctx = new AudioContext();
    void ctx.resume();
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = 0.5;
    out.connect(ctx.destination);

    // sharp click: a few ms of band-passed noise
    const len = Math.floor(ctx.sampleRate * 0.04);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.004));
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 3200;
    band.Q.value = 0.8;
    noise.connect(band).connect(out);
    noise.start(t);

    // body thump + short metallic ring
    for (const [freq, decay, level] of [[140, 0.06, 0.8], [2650, 0.09, 0.12], [4100, 0.05, 0.06]] as const) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = freq;
      g.gain.setValueAtTime(level, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + decay);
    }
    setTimeout(() => void ctx.close(), 400);
  } catch {
    // audio unavailable: the intro continues silently
  }
}
