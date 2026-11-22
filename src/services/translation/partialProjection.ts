import type { TranslationResult } from "./types";
import { isPlausibleJaTranslation } from "./quality";

interface SafeUnitProjectionCandidate {
  text: string;
  failedIndices: number[];
  complete: boolean;
}

/**
 * Validate server-provided semantic units independently. Unsafe units are
 * kept as exact source text while safe units remain translated. This is only
 * possible when the backend supplies a one-to-one source mapping; otherwise
 * callers must retain the whole-block fallback.
 */
export function projectSafeUnitTranslation(
  result: Pick<TranslationResult, "translationUnits" | "partialUnitTexts">,
  sourceText?: string,
): SafeUnitProjectionCandidate | null {
  const sources = result.translationUnits;
  const texts = result.partialUnitTexts;
  if (!sources?.length || !texts?.length || sources.length !== texts.length) return null;
  if (sourceText !== undefined) {
    const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
    if (normalize(sources.join(" ")) !== normalize(sourceText)) return null;
  }
  const failedIndices: number[] = [];
  const units = texts.map((text, index) => {
    const source = sources[index];
    if (isPlausibleJaTranslation(text, source)) return text;
    failedIndices.push(index);
    return source;
  });
  if (failedIndices.length === 0) return { text: units.join(" ").replace(/\s+/g, " ").trim(), failedIndices, complete: true };
  if (failedIndices.length === units.length) return null;
  return { text: units.join(" ").replace(/\s+/g, " ").trim(), failedIndices, complete: false };
}
