import { describe, expect, it } from "vitest";
import {
  classifyDocument,
  classifyPage,
  pageClassSignals,
  scannedByItemAverage,
} from "../../services/pdfExtraction/pageClass";
import type { ExtractedPage } from "../../services/pdfService";
import { pagesNeedingOcr } from "../../services/pdfExtraction/enrichers/ocr";

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
  it("keeps the scanned-by-item-average baseline", () => {
    const scanned = [page(["a", "b"], 1), page(["c"], 2)];
    expect(scannedByItemAverage(scanned)).toBe(true);
    const dense = [page(Array.from({ length: 40 }, (_, i) => `word${i}`))];
    expect(scannedByItemAverage(dense)).toBe(false);
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
});
