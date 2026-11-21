import stapleWav from "../../assets/intro/staple.wav";

// Measured on the shipped file (design/intro/sound/make.sh output, 1 ms envelope): first click 0.105 s, snap 0.365 s.
// The raw take has them at 0.083 / 0.347; denoise + ring processing moves them ~22 ms later.
export const STAPLE_FIRST_CLICK_S = 0.105;

let audio: HTMLAudioElement | null = null;

/** Load ahead of the click so fetching/decoding does not delay the first play. */
export function primeStapleSound(): void {
  if (audio) return;
  audio = new Audio(stapleWav);
  audio.preload = "auto";
  audio.load();
}

export function playStapleSound(): void {
  primeStapleSound();
  // autoplay refusal or missing codec: the intro continues silently
  audio?.play().catch(() => {});
}
