import { describe, expect, it } from "vitest";
import { joinWrappedDois, normalizeDoi } from "../../services/pdfExtraction/projection/toPaper";
import { findDoi } from "../../services/pdfExtraction/projection/venue";
import type { ExtractedTextItem } from "../../services/pdfService";

const item = (text: string, x: number, y: number): ExtractedTextItem => ({
  text, x, y, width: text.length * 4, height: 8, fontSize: 8, fontName: "Body", page: 1,
});

describe("DOI recovery", () => {
  it("reads the article DOI from a running footer on page 1", () => {
    const page = { pageNumber: 1, width: 612, height: 792, textItems: [
      item("Post-menopausal estrogen loss and kidney function", 72, 100),
      item("PLOS Computational Biology | https://doi.org/10.1371/journal.pcbi.1013101 September 22, 2026", 72, 760),
    ] };
    expect(findDoi([page])).toBe("10.1371/journal.pcbi.1013101");
  });

  it("joins a DOI broken by a line wrap and drops a glued date label", () => {
    expect(joinWrappedDois("https://doi.org/10.1371/journal. pone.0319664")).toBe("https://doi.org/10.1371/journal.pone.0319664");
    expect(joinWrappedDois("e0345073. https://doi.org/10.1371/ journal.pone.0345073")).toContain("10.1371/journal.pone.0345073");
    expect(joinWrappedDois("doi: 10.1000/182. The study")).toBe("doi: 10.1000/182. The study");
    expect(normalizeDoi("10.2147/JPR.S557124Received")).toBe("10.2147/JPR.S557124");
  });
});
