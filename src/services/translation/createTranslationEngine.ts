/**
 * Shared translation-engine wiring for import, resume, and Reader retry.
 * Keep PLaMo identical across those paths.
 */

import { PLAMO_MODEL, PLAMO_MODEL_VERSION, PlamoEngine } from "./plamoEngine";
import type { GlossaryEntry } from "../llm/types";
import type { TranslationEngine } from "./types";

export type TranslationEngineBundle = {
  engine: TranslationEngine;
  /** Engine that takes paper glossary term constraints. */
  primaryEngine: TranslationEngine;
  /** model used for translation_cache lookups; must equal TranslationResult.model the engine saves under. */
  cacheModel: string;
  /** model_version used for translation_cache lookups. */
  cacheModelVersion: string;
};

export function createTranslationEngine(): TranslationEngineBundle {
  const engine = new PlamoEngine();
  return {
    engine,
    primaryEngine: engine,
    cacheModel: PLAMO_MODEL,
    cacheModelVersion: PLAMO_MODEL_VERSION,
  };
}

/** Pass the paper glossary to engines that take term constraints (PLaMo); others keep post-hoc applyGlossary only. */
export function setEngineGlossary(bundle: Pick<TranslationEngineBundle, "primaryEngine">, entries: GlossaryEntry[]): void {
  if (bundle.primaryEngine instanceof PlamoEngine) bundle.primaryEngine.setGlossary(entries);
}
