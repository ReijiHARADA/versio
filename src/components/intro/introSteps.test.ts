import { describe, expect, it } from "vitest";
import { introStepAfterCta, nextIntroStep } from "./introSteps";

describe("introStepAfterCta", () => {
  it("offers PLaMo only when the model is known to be missing", () => {
    expect(introStepAfterCta("absent", false)).toBe("plamo");
    expect(introStepAfterCta("present", false)).toBe("howto-collect");
    for (const s of ["unavailable", "checking", "downloading", "error"] as const) {
      expect(introStepAfterCta(s, false)).toBe("howto-collect");
    }
  });
  it("shows PLaMo in onboarding preview even when installed", () => {
    expect(introStepAfterCta("present", true)).toBe("plamo");
  });
});

describe("nextIntroStep", () => {
  it("walks plamo → collect → read → close", () => {
    expect(nextIntroStep("plamo")).toBe("howto-collect");
    expect(nextIntroStep("howto-collect")).toBe("howto-read");
    expect(nextIntroStep("howto-read")).toBe("close");
  });
});
