/**
 * Shared translation-engine wiring for import, resume, and Reader retry.
 * Keep Apple → MADLAD (+ optional cascade) identical across those paths.
 */

import { OllamaProvider } from "../llm";
import { AppleTranslationEngine, SelectiveAppleTranslationEngine } from "./appleTranslationEngine";
import { MADLADEngine } from "./madladEngine";
import { OllamaTranslationEngine } from "./ollamaTranslationEngine";
import type { TranslationEngine } from "./types";

export type TranslationEngineConfig = {
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
  /** Same ordered providers used for selective cascade / glossary. */
  llmProviders: OllamaProvider[];
};

export function createTranslationEngine(
  cfg: TranslationEngineConfig
): TranslationEngineBundle {
  const madladEngine = new MADLADEngine(cfg.madladServerUrl);
  const appleRouter = cfg.enableAppleTranslation
    ? new SelectiveAppleTranslationEngine(new AppleTranslationEngine(), madladEngine)
    : null;
  const baseEngine = appleRouter ?? madladEngine;
  const llmProviders = [cfg.ollamaModel, ...(cfg.ollamaModels ?? [])]
    .filter(
      (model, index, models): model is string =>
        Boolean(model) && models.indexOf(model) === index
    )
    .map((model) => new OllamaProvider(cfg.ollamaServerUrl, model));
  const engine = cfg.enableSelectiveCascade
    ? new OllamaTranslationEngine(baseEngine, llmProviders)
    : baseEngine;
  return { engine, appleRouter, madladEngine, llmProviders };
}

export function setAppleEligibleSources(
  appleRouter: SelectiveAppleTranslationEngine | null,
  sources: Iterable<string>
): void {
  if (!appleRouter) return;
  appleRouter.setEligibleSources(new Set(sources));
}
