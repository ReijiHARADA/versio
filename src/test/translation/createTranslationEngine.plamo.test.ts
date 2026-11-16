import { describe, expect, it } from "vitest";
import { createTranslationEngine, type TranslationEngineConfig } from "../../services/translation/createTranslationEngine";
import { MADLADEngine, MADLAD_MODEL_VERSION } from "../../services/translation/madladEngine";
import { PLAMO_MODEL_VERSION, PlamoEngine } from "../../services/translation/plamoEngine";

const base: TranslationEngineConfig = {
  translationEngine: "plamo",
  madladServerUrl: "http://127.0.0.1:8765",
  ollamaServerUrl: "http://localhost:11434",
  ollamaModel: "gemma2:9b",
  ollamaModels: [],
  enableSelectiveCascade: false,
  enableAppleTranslation: true,
};

describe("createTranslationEngine", () => {
  it("plamo config yields PlamoEngine without apple router", () => {
    const b = createTranslationEngine(base);
    expect(b.engine).toBeInstanceOf(PlamoEngine);
    expect(b.primaryEngine).toBe(b.engine);
    expect(b.appleRouter).toBeNull();
    expect(b.cacheModelVersion).toBe(PLAMO_MODEL_VERSION);
  });

  it("madlad config yields previous bundle shape", () => {
    const b = createTranslationEngine({ ...base, translationEngine: "madlad" });
    expect(b.appleRouter).not.toBeNull();
    expect(b.engine).toBe(b.appleRouter);
    expect(b.madladEngine).toBeInstanceOf(MADLADEngine);
    expect(b.cacheModelVersion).toBe(MADLAD_MODEL_VERSION);
  });
});
