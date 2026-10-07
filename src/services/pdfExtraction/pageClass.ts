import type { ExtractedPage } from "../pdfService";
import { isScannedPdf } from "../ocrService";
import type { PageTextKind } from "./types";

export type PageClassSignals = {
  itemCount: number;
  charCount: number;
  replacementCount: number;
  spacedLetterHits: number;
  mathTokenHits: number;
  /** Words split by a single glyph token (e.g. `Transla T ion`). */
  splitWordHits: number;
  repeatedGlyphHits: number;
  brokenTokenHits: number;
  /** Rows that begin with short/stray tokens typical of transparent column text. */
  interleavedFragmentHits: number;
  imageHint: boolean;
};

export function pageClassSignals(page: ExtractedPage): PageClassSignals {
  const items = page.textItems;
  // Keep item boundaries visible to token-level corruption heuristics. PDF.js
  // often emits `word`, `&`, and `word` as separate items; concatenating them
  // hides malformed masthead tokens such as `АПФАПФ & ПЛ & ПЛ`.
  const text = items.map((item) => item.text).join(" ");
  const repeatedGlyphHits = (text.match(/([A-Za-z\u0400-\u04FF]{2,6})\1\1/gu) ?? []).length;
  // A single ampersand is ordinary in author pairs and journal titles
  // (`Arnold & Hartley`, `Analysis & Prevention`). Count only short all-caps
  // symbol pairs, which are the characteristic flattened forms (`АПФ & ПЛ`,
  // `CIP & PL`); normal title-case prose is left on native extraction.
  const brokenTokenHits = (text.match(/(?<![\p{L}])[A-ZА-ЯЁЇІЄҐ]{2,8}\s*&\s*[A-ZА-ЯЁЇІЄҐ]{2,8}(?![\p{L}])/gu) ?? []).length;
  const yTolerance = 2.5;
  const rows: ExtractedPage["textItems"][] = [];
  for (const item of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.find((candidate) => Math.abs(candidate[0].y - item.y) <= yTolerance);
    if (row) row.push(item); else rows.push([item]);
  }
  const interleavedFragmentHits = rows.filter((row) => {
    const ordered = [...row].sort((a, b) => a.x - b.x);
    if (ordered.length < 5) return false;
    const first = ordered[0].text.trim();
    const punctuationFragment = /^(?:[.]{1,3}|[”’")]+[.]?)$/.test(first);
    const shortToken = /^[a-z]{1,4}[-.]?$/i.test(first);
    // A normal sentence starts the next word at ordinary word spacing. A
    // transparent/interleaved column fragment leaves a conspicuous horizontal
    // gap before the following run; use geometry so words like "An" or "data"
    // in ordinary prose are not treated as corruption.
    const gapAfterFirst = ordered.length > 1
      ? ordered[1].x - (ordered[0].x + ordered[0].width)
      : 0;
    const geometricFragment = shortToken && gapAfterFirst > Math.max(12, ordered[0].height * 1.5);
    return punctuationFragment || geometricFragment;
  }).length;
  const mathTokenHits = (text.match(/\b[A-Za-z]\b/g) ?? []).length;
  return {
    itemCount: items.length,
    charCount: text.replace(/\s+/g, "").length,
    replacementCount: (text.match(/\uFFFD/g) ?? []).length,
    spacedLetterHits: (text.match(/\b[A-Za-z]\s+[A-Za-z]\s+[A-Za-z]/g) ?? [])
      .length,
    mathTokenHits,
    splitWordHits: [...text.matchAll(/\b([A-Za-z\u00C0-\u024F]{2,})\s+([A-Za-z\u00C0-\u024F])\s+([A-Za-z\u00C0-\u024F]{2,})\b/gu)]
      .filter((match) => {
        const [, left, glyph, right] = match;
        if (/^[aAiI]$/.test(glyph)) return false;
        if (/^[A-Z]$/.test(glyph) && /^[A-Z]/.test(left) && /^[A-Z]/.test(right)) return false;
        return true;
      })
      .length,
    repeatedGlyphHits,
    brokenTokenHits,
    interleavedFragmentHits,
    imageHint: false,
  };
}

export function classifyPage(signals: PageClassSignals): PageTextKind {
  if (signals.itemCount < 10 && signals.charCount < 40) return "scanned";
  const replacementRate =
    signals.charCount === 0 ? 1 : signals.replacementCount / signals.charCount;
  const mathHeavy = signals.charCount >= 1000 && signals.mathTokenHits >= 8 &&
    signals.mathTokenHits / signals.charCount >= 0.001;
  if (replacementRate >= 0.04 ||
      ((!mathHeavy && signals.spacedLetterHits >= 3) || (!mathHeavy && signals.splitWordHits >= 2)) ||
      (signals.repeatedGlyphHits >= 2 && signals.charCount >= 80) ||
      (signals.brokenTokenHits >= 2 && signals.charCount >= 200) ||
      (signals.interleavedFragmentHits >= 3 && signals.charCount >= 500)) return "garbled";
  if (signals.itemCount < 10) return "scanned";
  return "native-text";
}

export function classifyDocument(pages: ExtractedPage[]): PageTextKind {
  const kinds = pages.map((page) => classifyPage(pageClassSignals(page)));
  const unique = new Set(kinds);
  if (unique.size > 1) return "mixed";
  return kinds[0] ?? "scanned";
}

/** Baseline from ocrService, kept for import compatibility. */
export function scannedByItemAverage(
  pages: ExtractedPage[]
): boolean {
  const items = pages.reduce((sum, page) => sum + page.textItems.length, 0);
  return isScannedPdf(items, Math.max(pages.length, 1));
}
