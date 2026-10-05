import type { TranslationResult } from "./types";
import { isPlausibleJaTranslation } from "./quality";

export interface PartialProjectionCandidate {
  text: string;
  failedIndices: number[];
  complete: false;
  safeForReader: false;
}

export interface SafeUnitProjectionCandidate {
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

/**
 * Reconstructs a partial result for audit tooling only.
 *
 * A partial result is deliberately never considered reader-safe here: callers
 * must explicitly review failed units before exposing it. Keeping this pure
 * lets benchmarks measure the recoverable share without changing production
 * fallback behaviour.
 */
export function projectPartialTranslation(
  result: Pick<TranslationResult, "fallbackStage" | "unitFallbackIndices" | "partialUnitTexts" | "partialSourceUnits" | "partialText">,
): PartialProjectionCandidate | null {
  if (result.fallbackStage !== "partial_unit_fallback") return null;
  const texts = result.partialUnitTexts;
  const sourceUnits = result.partialSourceUnits;
  const failed = [...new Set(result.unitFallbackIndices ?? [])].sort((a, b) => a - b);
  if (!texts?.length || !sourceUnits || failed.length === 0) return null;
  if (failed.some((index) => !Number.isInteger(index) || index < 0 || index >= texts.length)) return null;
  if (sourceUnits.length !== failed.length) return null;
  const units = texts.slice();
  failed.forEach((index, position) => {
    const source = sourceUnits[position]?.trim();
    if (!source) return;
    units[index] = source;
  });
  if (units.some((unit) => typeof unit !== "string" || unit.trim().length === 0)) return null;
  return { text: units.join(" ").replace(/\s+/g, " ").trim(), failedIndices: failed, complete: false, safeForReader: false };
}
