import { describe, expect, it } from "vitest";
import { detectPageColumns, reconstructDocument } from "../../services/pdfLayout";
import type { ExtractedPage, ExtractedTextItem } from "../../services/pdfService";

// One justified body line per entry; `indent` shifts the first line of a typeset paragraph.
function page(lines: Array<{ text: string; indent?: number; short?: boolean }>): ExtractedPage {
  const textItems: ExtractedTextItem[] = lines.map((line, i) => ({
    text: line.text,
    x: 72 + (line.indent ?? 0),
    y: 120 + i * 12,
    width: (line.short ? 200 : 468) - (line.indent ?? 0),
    height: 10,
    fontSize: 10,
    fontName: "Body",
    page: 1,
  }));
  return { pageNumber: 2, width: 612, height: 792, textItems };
}

const body = (n: number) => `sentence ${n} of the paragraph continues with ordinary words about the study and its measured outcomes`;

describe("paragraph breaks at sentence boundaries", () => {
  it("does not take a body line ending in a citation number for a numbered equation", () => {
    const { blocks } = reconstructDocument([page([
      { text: `The methodological quality was assessed and ${body(1)}`, indent: 14 },
      { text: body(2) },
      { text: "the tool was used as per the guidelines of Whiting et al. (26)." },
      { text: `To evaluate the level of bias, ${body(3)}` },
      { text: body(4) },
      { text: "and the selection was decided with consensus.", short: true },
      { text: `A second paragraph starts here and ${body(5)}`, indent: 14 },
      { text: body(6) },
      { text: "and it ends here.", short: true },
    ])]);
    const paragraphs = blocks.filter((b) => b.role === "paragraph").map((b) => b.text);
    expect(blocks.some((b) => b.role === "equation")).toBe(false);
    // The full-width line before an unindented one continues the paragraph; the indented one starts the next.
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toMatch(/Whiting et al\. \(26\)\. To evaluate the level of bias/);
    expect(paragraphs[1]).toMatch(/^A second paragraph starts here/);
  });
});

describe("column gutter on word-split two-column pages", () => {
  it("keeps a line-final word of the left column in the left column", () => {
    // Every word is its own text item, as in some publisher PDFs; columns at x 48–291 and 304–546.
    const items: ExtractedTextItem[] = [];
    const words = "the athletes combine a rapid run and twists and then land on the slope with care".split(" ");
    for (let row = 0; row < 30; row += 1) {
      for (const [start, end] of [[48, 291], [304, 546]] as const) {
        let x = start;
        for (const w of words) {
          const width = Math.min(w.length * 5, end - x);
          if (width <= 0) break;
          items.push({ text: w, x, y: 100 + row * 12, width, height: 9, fontSize: 9, fontName: "Body", page: 2 });
          x += width + 2.5;
        }
      }
    }
    const layout = detectPageColumns({ pageNumber: 2, width: 595, height: 842, textItems: items });
    expect(layout.isMultiColumn).toBe(true);
    expect(layout.gutterX).toBeGreaterThan(291);
    expect(layout.gutterX).toBeLessThan(304);
  });
});
