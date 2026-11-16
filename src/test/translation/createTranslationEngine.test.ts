import { describe, expect, it } from "vitest";
import { resolveImportConfig } from "../../services/import/helpers";
import { createTranslationEngine } from "../../services/translation/createTranslationEngine";

describe("createTranslationEngine", () => {
  it("wires Apple → MADLAD when Apple translation is enabled", () => {
    const cfg = resolveImportConfig({ translationEngine: "madlad", enableAppleTranslation: true });
    const { engine, appleRouter, madladEngine } = createTranslationEngine(cfg);
    expect(appleRouter).not.toBeNull();
    expect(appleRouter?.name).toBe("selective-apple");
    expect(engine).toBe(appleRouter);
    expect(madladEngine.name).toBe("madlad");
  });

  it("uses MADLAD alone when Apple translation is disabled", () => {
    const cfg = resolveImportConfig({ translationEngine: "madlad", enableAppleTranslation: false });
    const { engine, appleRouter, madladEngine } = createTranslationEngine(cfg);
    expect(appleRouter).toBeNull();
    expect(engine).toBe(madladEngine);
  });

  it("wraps the Apple/MADLAD base with selective cascade when enabled", () => {
    const cfg = resolveImportConfig({
      translationEngine: "madlad",
      enableAppleTranslation: true,
      enableSelectiveCascade: true,
    });
    const { engine, appleRouter } = createTranslationEngine(cfg);
    expect(appleRouter).not.toBeNull();
    expect(engine.name).toBe("ollama-translation");
  });
});
