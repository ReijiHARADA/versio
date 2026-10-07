import { describe, expect, it } from "vitest";
import {
  classifyDocument,
  classifyPage,
  pageClassSignals,
  scannedByItemAverage,
} from "../../services/pdfExtraction/pageClass";
import type { ExtractedPage } from "../../services/pdfService";
import { pagesNeedingOcr, shouldAcceptOcr } from "../../services/pdfExtraction/enrichers/ocr";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractPdfPages } from "../readingOrder/extractPdf";

function page(
  texts: string[],
  pageNumber = 1
): ExtractedPage {
  return {
    pageNumber,
    width: 612,
    height: 792,
    textItems: texts.map((text, i) => ({
      text,
      x: 50,
      y: 80 + i * 12,
      width: 200,
      height: 10,
      fontSize: 10,
      fontName: "Times",
      page: pageNumber,
    })),
  };
}

describe("page classification", () => {
  it("routes split-glyph Cyrillic mastheads to OCR", async () => {
    const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
    const pdf = path.join(root, "test-data/real-papers/linguistics-the-role-of-applied-linguistics-and-language-discourse-analysis-in-eng.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    expect(classifyPage(pageClassSignals(pages[0]))).toBe("garbled");
    expect(pagesNeedingOcr(pages)).toContain(1);
  }, 60_000);

  it("does not route ordinary prose rows with short words to OCR", async () => {
    const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
    const pdf = path.join(root, "test-data/real-papers/hfe-healthcare-scoping-2024.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    expect(classifyDocument(pages)).toBe("native-text");
    expect(pagesNeedingOcr(pages)).toEqual(new Set());
  }, 60_000);

  it("keeps the scanned-by-item-average baseline", () => {
    const scanned = [page(["a", "b"], 1), page(["c"], 2)];
    expect(scannedByItemAverage(scanned)).toBe(true);
    const dense = [page(Array.from({ length: 40 }, (_, i) => `word${i}`))];
    expect(scannedByItemAverage(dense)).toBe(false);
  });

  it("keeps math-heavy native pages out of OCR routing", () => {
    const signals = pageClassSignals(page([
      ...Array.from({ length: 12 }, (_, i) => i === 0
        ? "D H W C Q K V Q D H Q W D H " + "ordinary body text ".repeat(100)
        : "body"),
    ]));
    expect(signals.mathTokenHits).toBeGreaterThanOrEqual(8);
    expect(classifyPage(signals)).toBe("native-text");
  });

  it("marks replacement-character pages as garbled", () => {
    const garbled = pageClassSignals(
      page(["Broken \uFFFD glyph \uFFFD \uFFFD text with enough items to avoid scan"])
    );
    garbled.itemCount = 20;
    garbled.charCount = 40;
    garbled.replacementCount = 8;
    expect(classifyPage(garbled)).toBe("garbled");
  });

  it("marks mixed documents when pages disagree", () => {
    const native = page(Array.from({ length: 30 }, (_, i) => `paragraph ${i}`), 1);
    const scanned = page(["x"], 2);
    expect(classifyDocument([native, scanned])).toBe("mixed");
  });

  it("flags repeated short glyph runs as garbled text", () => {
    const signals = pageClassSignals(page(Array.from({ length: 12 }, (_, i) =>
      i % 2 === 0 ? "АПФАПФАПФ" : "CIPCIPCIP")));
    expect(signals.repeatedGlyphHits).toBeGreaterThanOrEqual(2);
    expect(classifyPage(signals)).toBe("garbled");
  });

  it("flags broken symbol-joined masthead tokens", () => {
    const signals = pageClassSignals(page([
      "АПФ&ПЛ&ПЛ АПФ CIPCIP&PL&PL " + "ordinary Russian body text ".repeat(12),
      ...Array.from({ length: 11 }, () => "body"),
    ]));
    expect(signals.brokenTokenHits).toBeGreaterThanOrEqual(2);
    expect(classifyPage(signals)).toBe("garbled");
    expect(pagesNeedingOcr([page([
      "АПФ&ПЛ&ПЛ АПФ CIPCIP&PL&PL " + "ordinary Russian body text ".repeat(12),
      ...Array.from({ length: 11 }, () => "body"),
    ])])).toEqual(new Set([1]));
  });

  it("does not route ordinary author pairs and journal titles to OCR", () => {
    const signals = pageClassSignals(page([
      "Arnold & Hartley (2001). Accident Analysis & Prevention. ".repeat(8),
      ...Array.from({ length: 11 }, () => "body"),
    ]));
    expect(signals.brokenTokenHits).toBe(0);
    expect(classifyPage(signals)).toBe("native-text");
  });

  it("flags words split by a stray single glyph", () => {
    const signals = pageClassSignals(page([
      "Transla T ion and The r ole remain in the native text",
      ...Array.from({ length: 12 }, () => "body"),
    ]));
    expect(signals.splitWordHits).toBeGreaterThanOrEqual(2);
    expect(classifyPage(signals)).toBe("garbled");
    expect(pagesNeedingOcr([page([
      "Transla T ion and The r ole remain in the native text",
      ...Array.from({ length: 12 }, () => "body"),
    ])])).toEqual(new Set([1]));
  });

  it("routes pages with repeated transparent column fragments to OCR", () => {
    const fragments: ExtractedPage = {
      pageNumber: 1,
      width: 612,
      height: 792,
      textItems: [".", "two", "argue", "some", "more", "data", "from", "this"].flatMap((text, index) => [
        { text, x: 270, y: 100 + index * 18, width: 10, height: 8, fontSize: 8, fontName: "Times", page: 1 },
        ...["ordinary", "body", "text", "continues", "here", "with", "enough", "content", "to", "trigger", "the", "guard"].map((word, wordIndex) =>
          ({ text: word, x: 306 + wordIndex * 28, y: 100 + index * 18, width: 22, height: 8, fontSize: 8, fontName: "Times", page: 1 })),
      ]),
    };
    const signals = pageClassSignals(fragments);
    expect(signals.interleavedFragmentHits).toBeGreaterThanOrEqual(3);
    expect(classifyPage(signals)).toBe("garbled");
    expect(pagesNeedingOcr([fragments])).toEqual(new Set([1]));
  });

  it("keeps native text when OCR is unexpectedly sparse", () => {
    expect(shouldAcceptOcr("native body ".repeat(100), "short OCR")).toBe(false);
    expect(shouldAcceptOcr("", "short OCR")).toBe(true);
    expect(shouldAcceptOcr("native body ".repeat(100), "ocr body ".repeat(60))).toBe(true);
  });
});
