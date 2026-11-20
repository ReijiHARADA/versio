import stapleM4a from "../../assets/intro/staple.m4a";

// Recorded two-stage press (design/intro/sound/): first click at 0.083 s, snap at 0.347 s.
export const STAPLE_FIRST_CLICK_S = 0.083;

export function playStapleSound(): void {
  // autoplay refusal or missing codec: the intro continues silently
  new Audio(stapleM4a).play().catch(() => {});
}
