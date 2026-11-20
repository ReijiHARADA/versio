import { describe, expect, it } from "vitest";
import { extractFromPages } from "../../services/pdfExtraction/pipeline/extractAcademicPdf";
import type { ExtractedTextItem } from "../../services/pdfService";

const item = (text: string, x: number, y: number, fontSize: number, page: number): ExtractedTextItem => ({
  text, x, y, width: text.length * fontSize * 0.45, height: fontSize, fontSize, fontName: fontSize > 12 ? "Title" : "Body", page,
});
const prose = [
  "Most existing studies have relied heavily on data collected from one platform, and the",
  "evidence they report may not represent the wider market that users actually choose from.",
  "We therefore collected designs from two platforms and compared them on the same features,",
  "which lets us describe how the choices differ and which of them people prefer to install.",
];

describe("page-two continuation of a page-one metadata rail", () => {
  it("reads the small left-margin lines as one note, not body text", async () => {
    const page1 = [item("A comparative study of smartwatch face designs", 198, 90, 18, 1),
      ...Array.from({ length: 10 }, (_, i) => item(prose[i % 4], 198, 160 + i * 14, 10, 1))];
    const page2 = [
      item("Competing interests: The authors have", 36, 83, 8, 2),
      item("declared that no competing interests exist.", 36, 94, 8, 2),
      ...Array.from({ length: 12 }, (_, i) => item(prose[i % 4], 198, 85 + i * 14, 10, 2)),
    ];
    const result = await extractFromPages({ pages: [
      { pageNumber: 1, width: 612, height: 792, textItems: page1 },
      { pageNumber: 2, width: 612, height: 792, textItems: page2 },
    ], paperId: "rail-note", filePath: "rail-note.pdf", fileHash: "rail-note", metadata: { pageCount: 2 } });
    const notes = result.blocks.filter((b) => b.type === "footnote").map((b) => b.original);
    expect(notes).toContain("Competing interests: The authors have declared that no competing interests exist.");
    expect(result.blocks.some((b) => b.type === "paragraph" && /competing interests/i.test(b.original ?? ""))).toBe(false);
  });
});
