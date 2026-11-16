/**
 * Shared translation-engine wiring for import, resume, and Reader retry.
 * Keep PLaMo (+ optional cascade) identical across those paths.
 */

import { OllamaProvider } from "../llm";
import { PLAMO_MODEL, PLAMO_MODEL_VERSION, PlamoEngine } from "./plamoEngine";
import { OllamaTranslationEngine } from "./ollamaTranslationEngine";
import type { GlossaryEntry } from "../llm/types";
import type { TranslationEngine } from "./types";

export type TranslationEngineConfig = {
  ollamaServerUrl: string;
  ollamaModel: string;
  ollamaModels: string[];
  enableSelectiveCascade: boolean;
};

export type TranslationEngineBundle = {
  engine: TranslationEngine;
  /** Base engine before the optional Ollama cascade. */
  primaryEngine: TranslationEngine;
  /** model used for translation_cache lookups; must equal TranslationResult.model the engine saves under. */
  cacheModel: string;
  /** model_version used for translation_cache lookups. */
  cacheModelVersion: string;
  /** Same ordered providers used for selective cascade / glossary. */
  llmProviders: OllamaProvider[];
};

export function createTranslationEngine(
  cfg: TranslationEngineConfig
): TranslationEngineBundle {
  const baseEngine: TranslationEngine = new PlamoEngine();
  const llmProviders = [cfg.ollamaModel, ...(cfg.ollamaModels ?? [])]
    .filter(
      (model, index, models): model is string =>
        Boolean(model) && models.indexOf(model) === index
    )
    .map((model) => new OllamaProvider(cfg.ollamaServerUrl, model));
  const engine = cfg.enableSelectiveCascade
    ? new OllamaTranslationEngine(baseEngine, llmProviders)
    : baseEngine;
  return {
    engine,
    primaryEngine: baseEngine,
    cacheModel: PLAMO_MODEL,
    cacheModelVersion: PLAMO_MODEL_VERSION,
    llmProviders,
  };
}

/** Pass the paper glossary to engines that take term constraints (PLaMo); others keep post-hoc applyGlossary only. */
export function setEngineGlossary(bundle: Pick<TranslationEngineBundle, "primaryEngine">, entries: GlossaryEntry[]): void {
  if (bundle.primaryEngine instanceof PlamoEngine) bundle.primaryEngine.setGlossary(entries);
}
