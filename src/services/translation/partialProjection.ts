import type { TranslationResult } from "./types";

export interface PartialProjectionCandidate {
  text: string;
  failedIndices: number[];
  complete: false;
  safeForReader: false;
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
