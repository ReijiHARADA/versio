import { describe, expect, it } from "vitest";
import { extractFromPages } from "../../services/pdfExtraction/pipeline/extractAcademicPdf";
import type { ExtractedTextItem } from "../../services/pdfService";

const item = (text: string, y: number, fontSize = 10): ExtractedTextItem => ({
  text, x: 57, y, width: text.length * fontSize * 0.45, height: fontSize, fontSize, fontName: fontSize > 12 ? "Title" : "Body", page: 1,
});
const body = "Respiratory infections remain a leading cause of hospital admission among young children in many regions, and the evidence on early detection is still thin.";

describe("byline rows with long or wrapped names", () => {
  it("keeps a four-token name and a given name wrapped to the row end", async () => {
    const textItems = [
      item("Early detection of pneumonia in young children", 120, 18),
      item("Le Trong Minh1, Nguyen Khanh Tho Loc1,2, Ayaz Ahmed2, Md", 170),
      item("Mozibur Rahman1, Ting Shi2 and Harry Campbell2", 184),
      item("1 Department of Public Health, University of Dhaka, Dhaka, Bangladesh", 210, 8),
      item("2 Usher Institute, University of Edinburgh, Edinburgh, United Kingdom", 221, 8),
      item("Abstract", 250, 11),
      ...Array.from({ length: 8 }, (_, i) => item(body.slice(0, 90), 270 + i * 13)),
    ];
    const result = await extractFromPages({ pages: [{ pageNumber: 1, width: 612, height: 792, textItems }], paperId: "byline-wrap", filePath: "byline-wrap.pdf", fileHash: "byline-wrap", metadata: { pageCount: 1 } });
    expect(result.paper.authors).toEqual(expect.arrayContaining(["Nguyen Khanh Tho Loc", "Md Mozibur Rahman", "Ayaz Ahmed"]));
    expect(result.paper.authors).not.toContain("Tho Loc");
  });
});
