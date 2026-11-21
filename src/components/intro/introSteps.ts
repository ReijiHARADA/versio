import type { PlamoModelState } from "../settings/usePlamoModel";

/** After the intro CTA: offer the PLaMo download only when we know the model is missing. */
export function introStepAfterCta(state: PlamoModelState): "plamo" | "close" {
  return state === "absent" ? "plamo" : "close";
}
