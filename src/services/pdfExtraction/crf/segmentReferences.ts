/** Ported from GROBID 0.9.1 ReferenceSegmenterParser.java (Apache-2.0), modified. */
import { decode } from "./wapiti";
import { loadCrfModel } from "./model";
import { referenceSegmenterFeatureRows } from "./referenceSegmenterFeatures";

export type RefLine = { text: string; x: number; width: number; fontSize: number; blockStart: boolean };

/** Segment a reference section into raw entries. CRF labels define starts; robust line markers retain PDF text when labels are noisy. */
export function segmentReferences(lines: RefLine[]): string[] {
  if (!lines.length) return [];
  // pdf.js/projection can coalesce several visual entries into one block. Restore
  // explicit numeric labels before CRF line segmentation (the same labels are
  // a primary reference-segmenter signal in the GROBID model).
  const visualLines = lines.flatMap((line) => line.text.split(/(?=\s*\[\s*\d+\s*\]\s*)/).map((text) => ({ ...line, text: text.trim() })).filter((line) => line.text));
  const features = referenceSegmenterFeatureRows(visualLines.filter((line) => line.text.trim()));
  if (!features.rows.length) return [];
  const labels = decode(loadCrfModel("reference-segmenter"), features.rows);
  const starts = new Set<number>();
  labels.forEach((label, index) => { if (label === "I-<reference>" || label === "I-<label>") starts.add(features.lineForToken[index]); });
  // GROBID's labels often start after a label token. Keep explicit numbering as a conservative PDF-layout fallback.
  visualLines.forEach((line, index) => { if (/^\s*(?:\[\s*\d+\s*\]|\d+[.)])\s+/.test(line.text)) starts.add(index); });
  starts.add(0);
  const boundaries = [...starts].filter((index) => index >= 0 && index < visualLines.length).sort((a, b) => a - b);
  return boundaries.map((start, i) => visualLines.slice(start, boundaries[i + 1] ?? visualLines.length).map((line) => line.text.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim()).filter(Boolean);
}
