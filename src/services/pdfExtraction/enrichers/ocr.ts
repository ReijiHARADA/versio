import type { ExtractedPage } from "../../pdfService";
import { ocrDocument } from "../../ocrService";
import { classifyPage, pageClassSignals, scannedByItemAverage } from "../pageClass";
import type { ExtractionEnricher } from "./types";
import type { ExtractionEvidence } from "../types";

export function pagesNeedingOcr(pages: ExtractedPage[]): Set<number> {
  const needed = new Set<number>();
  const baselineAll = scannedByItemAverage(pages);
  const pageKinds = pages.map((page) => classifyPage(pageClassSignals(page)));
  // A low document-wide item average is useful for an entirely scanned PDF,
  // but it is a poor signal for mixed papers: figure-heavy native pages can
  // pull the average below the threshold while their text remains usable.
  // Only apply the document-wide fallback when every page is independently
  // classified as scanned or garbled; otherwise rely on page-local evidence.
  const wholeDocumentNeedsOcr = baselineAll && pageKinds.every((kind) =>
    kind === "scanned" || kind === "garbled"
  );
  for (const [index, page] of pages.entries()) {
    const kind = pageKinds[index];
    if (wholeDocumentNeedsOcr || kind === "scanned" || kind === "garbled") {
      needed.add(page.pageNumber);
    }
  }
  return needed;
}

/** Keep native text when Vision returned an unexpectedly sparse page. */
export function shouldAcceptOcr(nativeText: string, ocrText: string): boolean {
  const nativeChars = nativeText.replace(/\s+/g, "").length;
  const ocrChars = ocrText.replace(/\s+/g, "").length;
  if (ocrChars === 0) return false;
  // Scanned pages have little native text, so any non-empty OCR result wins.
  if (nativeChars < 80) return true;
  return ocrChars >= Math.max(80, nativeChars * 0.35);
}

export const visionOcrEnricher: ExtractionEnricher = {
  id: "vision-ocr",
  shouldRun(context) {
    return pagesNeedingOcr(context.pages).size > 0;
  },
  async extract(context) {
    const pages = [...pagesNeedingOcr(context.pages)];
    const evidence: ExtractionEvidence[] = pages.map((page) => ({
      source: "ocr" as const,
      label: "page",
      confidence: 0.55,
      page,
      reason: "scanned or garbled page; Vision OCR fallback",
    }));
    return evidence;
  },
};

export async function applyVisionOcr(
  pages: ExtractedPage[],
  pdfDoc: unknown,
  onProgress?: (page: number, total: number) => void
): Promise<{ pages: ExtractedPage[]; ocrPages: Set<number> }> {
  const needed = pagesNeedingOcr(pages);
  if (needed.size === 0) {
    return { pages, ocrPages: new Set() };
  }

  // Do not OCR healthy native pages in mixed documents. Apart from the cost,
  // replacing a native page with OCR introduces avoidable reading-order and
  // character errors. `needed` is computed from the same page classifier used
  // by the extraction pipeline, so the replacement boundary stays explicit.
  const ocrResults = await ocrDocument(pdfDoc, ["en-US", "ja-JP", "ru-RU"], onProgress, needed);
  const ocrPages = new Set<number>();
  for (const ocrPage of ocrResults) {
    if (!needed.has(ocrPage.pageNumber) || ocrPage.lines.length === 0) continue;
    const pdfPage = pages.find((p) => p.pageNumber === ocrPage.pageNumber);
    if (!pdfPage) continue;
    const nativeText = pdfPage.textItems.map((item) => item.text).join(" ");
    const ocrText = ocrPage.lines.map((line) => line.text).join(" ");
    if (!shouldAcceptOcr(nativeText, ocrText)) continue;
    pdfPage.textItems = ocrPage.lines.map((line, idx) => {
      const bounds = line.bounds;
      const width = pdfPage.width;
      const height = pdfPage.height;
      return {
        text: line.text,
        x: bounds ? bounds.x * width : 0,
        // Vision uses a bottom-left origin; layout uses a top-left origin.
        y: bounds ? (1 - bounds.y - bounds.height) * height : idx * 20,
        width: bounds ? bounds.width * width : width,
        height: bounds ? bounds.height * height : 14,
        fontSize: bounds ? Math.max(8, bounds.height * height) : 12,
        fontName: "ocr",
        page: ocrPage.pageNumber,
      };
    });
    ocrPages.add(ocrPage.pageNumber);
  }
  return { pages, ocrPages };
}
