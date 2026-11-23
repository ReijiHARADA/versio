import {
  SynonymDictionary,
  type SynonymDictionaryData,
} from "../../domain/search/synonymDictionary";

let pending: Promise<SynonymDictionary | null> | null = null;

/**
 * The bundled search dictionary (`src/generated/synonyms.json`, built by
 * `scripts/synonyms/build-dictionary.ts`). Loaded once, on first use, as its
 * own chunk; search works without it if loading fails.
 */
export function loadSynonymDictionary(): Promise<SynonymDictionary | null> {
  pending ??= import("../../generated/synonyms.json")
    .then((module) => new SynonymDictionary(module.default as unknown as SynonymDictionaryData))
    .catch((error: unknown) => {
      console.warn("Synonym dictionary failed to load; searching without it:", error);
      pending = null;
      return null;
    });
  return pending;
}
