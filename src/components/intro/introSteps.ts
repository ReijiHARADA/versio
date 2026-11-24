import type { PlamoModelState } from "../settings/usePlamoModel";

/** Onboarding test builds (`npm run onboarding:test`) show the PLaMo screen even with the model installed. */
export const ONBOARDING_PREVIEW = import.meta.env.VITE_VERSIO_ONBOARDING_PREVIEW === "1";

export type IntroStep = "intro" | "plamo" | "howto-collect" | "howto-read";

/** After the intro CTA: offer the PLaMo download only when we know the model is missing. */
export function introStepAfterCta(state: PlamoModelState, preview = ONBOARDING_PREVIEW): "plamo" | "howto-collect" {
  return state === "absent" || (preview && state === "present") ? "plamo" : "howto-collect";
}

/** Everyone sees both how-to pages, whether they downloaded PLaMo, deferred it, or already have it. */
export function nextIntroStep(step: IntroStep): IntroStep | "close" {
  switch (step) {
    case "intro":
    case "plamo":
      return "howto-collect";
    case "howto-collect":
      return "howto-read";
    case "howto-read":
      return "close";
  }
}
