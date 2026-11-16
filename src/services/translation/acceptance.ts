/**
 * Which acceptance rule applies where.
 * - Fresh output / cache hits are judged by the rule of the engine that produced them:
 *   PLaMo → deterministic check, legacy MADLAD → its own legacy gate.
 * - Persisted translations (resume) may come from either engine, so either rule keeps them;
 *   otherwise switching engines would re-queue every legacy-accepted block on each resume.
 */
import { isPlausibleJaTranslation } from "./quality";
import { isAcceptableTranslation } from "./translationCheck";

export type AcceptanceRule = (output: string, source: string) => boolean;

export function acceptFor(engine: "plamo" | "madlad" | undefined): AcceptanceRule {
  return engine === "madlad" ? isPlausibleJaTranslation : isAcceptableTranslation;
}

export function isPersistedTranslationUsable(output: string, source: string): boolean {
  return isAcceptableTranslation(output, source) || isPlausibleJaTranslation(output, source);
}
