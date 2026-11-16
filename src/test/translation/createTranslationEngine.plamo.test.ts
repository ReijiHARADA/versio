import { describe, expect, it } from "vitest";
import { createTranslationEngine, type TranslationEngineConfig } from "../../services/translation/createTranslationEngine";
import { PLAMO_MODEL, PLAMO_MODEL_VERSION, PlamoEngine } from "../../services/translation/plamoEngine";

const base: TranslationEngineConfig = {
  ollamaServerUrl: "http://localhost:11434",
  ollamaModel: "gemma2:9b",
  ollamaModels: [],
  enableSelectiveCascade: false,
};

describe("createTranslationEngine", () => {
  it("always yields PlamoEngine", () => {
    const b = createTranslationEngine(base);
    expect(b.engine).toBeInstanceOf(PlamoEngine);
    expect(b.primaryEngine).toBe(b.engine);
    expect(b.cacheModelVersion).toBe(PLAMO_MODEL_VERSION);
    expect(b.cacheModel).toBe(PLAMO_MODEL);
  });

});

import { setEngineGlossary } from "../../services/translation/createTranslationEngine";
import { glossaryForText } from "../../services/translation/plamoEngine";

describe("setEngineGlossary", () => {
  it("hands the paper glossary to PLaMo", () => {
    const entries = [{ term: "RR", translation: "呼吸数" }];
    const plamo = createTranslationEngine(base);
    setEngineGlossary(plamo, entries);
    expect((plamo.primaryEngine as PlamoEngine)["glossary"]).toEqual(entries);
    expect(glossaryForText("HR and RR", entries)).toEqual([{ source: "RR", target: "呼吸数" }]);
  });
});
