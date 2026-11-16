/** Ported from GROBID 0.9.1 ReferenceSegmenterParser.java (Apache-2.0), modified. */
import { decode } from "./wapiti";
import { crfRuntime } from "./runtime";
import { referenceSegmenterFeatureRows } from "./referenceSegmenterFeatures";

export type RefLine = {
  text: string;
  x: number;
  width: number;
  fontSize: number;
  blockStart: boolean;
  /** Source geometry for building block boxes (absent in synthetic tests). */
  page?: number;
  y?: number;
  height?: number;
};

export type ReferenceSegment = { text: string; lines: RefLine[] };

/** Segment a reference section into entries, keeping the source lines of each. */
export function segmentReferenceLines(lines: RefLine[]): ReferenceSegment[] {
  if (!lines.length) return [];
  // pdf.js/projection can coalesce several visual entries into one line. Restore
  // explicit numeric labels before CRF line segmentation (the same labels are
  // a primary reference-segmenter signal in the GROBID model).
  const visualLines = lines
    .flatMap((line) => line.text.split(/(?=\s*\[\s*\d+\s*\]\s*)/).map((text) => ({ ...line, text: text.trim() })))
    .filter((line) => line.text);
  const features = referenceSegmenterFeatureRows(visualLines);
  if (!features.rows.length) return [];
  const labels = decode(crfRuntime().segmenter, features.rows);
  const starts = new Set<number>();
  labels.forEach((label, index) => {
    if (label === "I-<reference>" || label === "I-<label>") starts.add(features.lineForToken[index]);
  });
  // GROBID's labels often start after a label token. Keep explicit numbering as a conservative PDF-layout fallback.
  visualLines.forEach((line, index) => {
    // At most 3 digits: "2025. URL ..." is the tail of an entry, not label 2025.
    if (/^\s*(?:\[\s*\d+\s*\]|\d{1,3}[.)])\s+/.test(line.text)) starts.add(index);
  });
  starts.add(0);
  const boundaries = [...starts].filter((index) => index >= 0 && index < visualLines.length).sort((a, b) => a - b);
  return boundaries
    .map((start, i) => {
      const part = visualLines.slice(start, boundaries[i + 1] ?? visualLines.length);
      return { text: joinLines(part.map((line) => line.text)), lines: part };
    })
    .filter((segment) => segment.text);
}

/**
 * Join the lines of one entry, undoing line-end hyphenation: "learn- ing" →
 * "learning" when the joined word is in the English word list, otherwise the
 * hyphen stays and the space goes ("large-scale", "Out-of-Distribution").
 */
export function joinLines(texts: string[], words: Set<string> = crfRuntime().lexicons.commonWords): string {
  let out = "";
  for (const raw of texts) {
    const text = raw.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const hyphen = /(\p{L}+)-$/u.exec(out);
    if (hyphen) {
      const next = /^\p{L}+/u.exec(text)?.[0] ?? "";
      const joined = (hyphen[1] + next).toLowerCase();
      out = next && /^\p{Ll}/u.test(next) && words.has(joined) ? out.slice(0, -1) + text : out + text;
    } else out = out ? `${out} ${text}` : text;
  }
  return out;
}

/** Segment a reference section into raw entry strings. */
export function segmentReferences(lines: RefLine[]): string[] {
  return segmentReferenceLines(lines).map((segment) => segment.text);
}
