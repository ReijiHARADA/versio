import {
  isGarbageTitle,
  looksLikeBibliographyEntry,
} from "./documentPolicy";

/**
 * Pure source-shape policies used before a block is sent to the translator.
 * The public facade in quality.ts keeps the historical API and supplies the
 * heading policy, so callers do not need to know about this module.
 */
export function shouldTranslateCaption(text: string, toHalfwidthAscii: (value: string) => string): boolean {
  const normalized = toHalfwidthAscii(text)
    .trim()
    .replace(/^(?:figure|fig\.?|tables?|図|表)\s+\S+\s*[:.：–—-]?\s*/i, "");
  if (normalized.length < 8) return false;
  if (looksLikeBibliographyEntry(normalized)) return false;
  return /[A-Za-z]{3,}/.test(normalized);
}

export function shouldTranslateTitle(
  text: string,
  shouldTranslateHeading: (value: string) => boolean,
): boolean {
  const normalized = text.trim();
  if (!shouldTranslateHeading(normalized) && normalized.length < 8) return false;
  if (isGarbageTitle(normalized)) return false;
  if (/@/.test(normalized)) return false;
  if (/^[\d.\s]+$/.test(normalized)) return false;
  if (/^\d{2,}(?:\.\d+){2,}/.test(normalized)) return false;
  return normalized.length >= 8 && normalized.length <= 220;
}
