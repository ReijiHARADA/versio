import type { PlamoModelState } from "../settings/usePlamoModel";

/** Onboarding test builds (`npm run onboarding:test`) show the PLaMo screen even with the model installed. */
export const ONBOARDING_PREVIEW = import.meta.env.VITE_VERSIO_ONBOARDING_PREVIEW === "1";

/** After the intro CTA: offer the PLaMo download only when we know the model is missing. */
export function introStepAfterCta(state: PlamoModelState, preview = ONBOARDING_PREVIEW): "plamo" | "close" {
  return state === "absent" || (preview && state === "present") ? "plamo" : "close";
}
