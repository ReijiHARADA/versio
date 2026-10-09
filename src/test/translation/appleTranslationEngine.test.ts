import { describe, expect, it } from "vitest";
import { AppleTranslationEngine, SelectiveAppleTranslationEngine, isAppleEligibleSource } from "../../services/translation/appleTranslationEngine";
import type { TranslationEngine, TranslationResult } from "../../services/translation/types";

const result = (text: string, model: string): TranslationResult => ({
  text, sourceLanguage: "en", targetLanguage: "ja", model, modelVersion: "test",
  inputChars: 10, outputChars: text.length, translationTimeMs: 1, charsPerSec: text.length,
});

describe("Apple translation eligibility", () => {
  it("accepts complete ordinary prose", () => {
    expect(isAppleEligibleSource("The study examined 20 participants and found no significant difference between the conditions.")).toBe(true);
  });
  it("rejects structural and contaminated sources", () => {
    expect(isAppleEligibleSource("ABSTRACT")).toBe(false);
    expect(isAppleEligibleSource("author@example.com 1,2")).toBe(false);
    expect(isAppleEligibleSource("Figure 2")).toBe(false);
    expect(isAppleEligibleSource("This sentence is truncated at the page boundary and")).toBe(false);
  });

  it("routes eligible prose to Apple and keeps MADLAD as the safe fallback", async () => {
    const source = "The study examined 20 participants and found no significant difference between the conditions.";
    const madlad: TranslationEngine = {
      name: "madlad", translate: async () => result("MADLAD訳", "madlad"),
      translateBatch: async () => [], getStatus: async () => ({ available: true, modelLoaded: true, modelName: "m", modelVersion: "v", device: "test" }),
      loadModel: async () => {}, unloadModel: async () => {},
    };
    const apple = new AppleTranslationEngine();
    const route = new SelectiveAppleTranslationEngine(apple, madlad);
    const output = await route.translate(source, "en", "ja");
    expect(["MADLAD訳", source]).toContain(output.text);
    expect(output.model === "madlad" || output.model === "Apple Translation").toBe(true);
    expect((await route.translate("ABSTRACT", "en", "ja")).model).toBe("madlad");
  });
});
