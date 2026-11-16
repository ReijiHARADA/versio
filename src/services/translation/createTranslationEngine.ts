/**
 * Shared translation-engine wiring for import, resume, and Reader retry.
 * Keep Apple → MADLAD (+ optional cascade) identical across those paths.
 */

import { OllamaProvider } from "../llm";
import { AppleTranslationEngine, SelectiveAppleTranslationEngine } from "./appleTranslationEngine";
import { MADLADEngine, MADLAD_MODEL_VERSION } from "./madladEngine";
import { PLAMO_MODEL_VERSION, PlamoEngine } from "./plamoEngine";
import { OllamaTranslationEngine } from "./ollamaTranslationEngine";
import type { TranslationEngine } from "./types";

export type TranslationEngineConfig = {
  translationEngine?: "plamo" | "madlad";
  madladServerUrl: string;
  ollamaServerUrl: string;
  ollamaModel: string;
  ollamaModels: string[];
  enableSelectiveCascade: boolean;
  enableAppleTranslation: boolean;
};

export type TranslationEngineBundle = {
  engine: TranslationEngine;
  appleRouter: SelectiveAppleTranslationEngine | null;
  madladEngine: MADLADEngine;
  /** Base engine before the optional Ollama cascade. */
  primaryEngine: TranslationEngine;
  /** model_version used for translation_cache lookups. */
  cacheModelVersion: string;
  /** Same ordered providers used for selective cascade / glossary. */
  llmProviders: OllamaProvider[];
};

export function createTranslationEngine(
  cfg: TranslationEngineConfig
): TranslationEngineBundle {
  const madladEngine = new MADLADEngine(cfg.madladServerUrl);
  const usePlamo = (cfg.translationEngine ?? "plamo") === "plamo";
  // The Apple short-item router existed to speed up MADLAD; PLaMo does not need it.
  const appleRouter = !usePlamo && cfg.enableAppleTranslation
    ? new SelectiveAppleTranslationEngine(new AppleTranslationEngine(), madladEngine)
    : null;
  const baseEngine: TranslationEngine = usePlamo ? new PlamoEngine() : appleRouter ?? madladEngine;
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
    appleRouter,
    madladEngine,
    primaryEngine: baseEngine,
    cacheModelVersion: usePlamo ? PLAMO_MODEL_VERSION : MADLAD_MODEL_VERSION,
    llmProviders,
  };
}

export function setAppleEligibleSources(
  appleRouter: SelectiveAppleTranslationEngine | null,
  sources: Iterable<string>
): void {
  if (!appleRouter) return;
  appleRouter.setEligibleSources(new Set(sources));
}
