import { describe, expect, it } from "vitest";
import { detectPageColumns, reconstructDocument } from "../../services/pdfLayout";
import type { ExtractedPage, ExtractedTextItem } from "../../services/pdfService";

// One justified body line per entry; `indent` shifts the first line of a typeset paragraph.
function page(lines: Array<{ text: string; indent?: number; short?: boolean }>, pageNumber = 2): ExtractedPage {
  const textItems: ExtractedTextItem[] = lines.map((line, i) => ({
    text: line.text,
    x: 72 + (line.indent ?? 0),
    y: 120 + i * 12,
    width: (line.short ? 200 : 468) - (line.indent ?? 0),
    height: 10,
    fontSize: 10,
    fontName: "Body",
    page: pageNumber,
  }));
  return { pageNumber, width: 612, height: 792, textItems };
}

const body = (n: number) => `sentence ${n} of the paragraph continues with ordinary words about the study and its measured outcomes`;

describe("paragraph breaks at sentence boundaries", () => {
  it("keeps a body continuation with a leading numeric citation out of footnotes", () => {
    const textItems: ExtractedTextItem[] = [
      { text: "Despite the extensive literature on COVID-19 (3, 7, 8, 10", x: 50, y: 601, width: 241, height: 9, fontSize: 9, fontName: "Body", page: 2 },
      { text: "13), there remains a gap in the systematic synthesis of data.", x: 50, y: 613, width: 241, height: 9, fontSize: 9, fontName: "Body", page: 2 },
    ];
    const { blocks } = reconstructDocument([{ pageNumber: 2, width: 595, height: 842, textItems }]);
    expect(blocks.filter((block) => block.role === "footnote")).toHaveLength(0);
    expect(blocks.find((block) => block.role === "paragraph")?.text).toContain("10 13), there remains");
  });

  it("keeps a smaller numbered note at the page bottom as a footnote", () => {
    const textItems: ExtractedTextItem[] = [
      { text: "The body paragraph ends before the source note.", x: 50, y: 700, width: 241, height: 9, fontSize: 9, fontName: "Body", page: 2 },
      { text: "1) Source note for the reported outcome.", x: 50, y: 760, width: 241, height: 7, fontSize: 7, fontName: "Note", page: 2 },
    ];
    const { blocks } = reconstructDocument([{ pageNumber: 2, width: 595, height: 842, textItems }]);
    expect(blocks.find((block) => block.role === "footnote")?.text).toContain("1) Source note");
  });

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

  it("rejoins a sentence cut before a `Table 8)` reference on the next page", () => {
    const { blocks } = reconstructDocument([
      page([{ text: `Retinal staining was quantified and ${body(1)}`, indent: 14 }, { text: body(2) }, { text: `${body(3)} as listed in Supplementary` }], 2),
      page([{ text: `Table 8). The infected group ${body(4)}` }, { text: body(5) }, { text: "and it ends here.", short: true }], 3),
    ]);
    const paragraphs = blocks.filter((b) => b.role === "paragraph").map((b) => b.text);
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]).toMatch(/Supplementary Table 8\)\. The infected group/);
  });
});

describe("column gutter on word-split two-column pages", () => {
  it("keeps paired body columns below PMC12146323's ruled table", () => {
    const items: ExtractedTextItem[] = [];
    for (let row = 0; row < 16; row += 1) {
      items.push({ text: `TABLE 2 search strategy row ${row}`, x: 50, y: 112 + row * 8, width: 496, height: 9, fontSize: 9, fontName: "Body", page: 5 });
    }
    for (let row = 0; row < 12; row += 1) {
      const y = 360 + row * 10;
      items.push({ text: `The study evidenced that older individuals exhibit ${row}`, x: 50, y, width: 241, height: 9, fontSize: 9, fontName: "Body", page: 5 });
      items.push({ text: `The interplay of social and demographic factors ${row}`, x: 305, y, width: 241, height: 9, fontSize: 9, fontName: "Body", page: 5 });
    }
    const graphicsPrimitives = [
      { kind: "line" as const, orientation: "horizontal" as const, x: 50, y: 100, width: 496, height: 1, confidence: 1 },
      { kind: "line" as const, orientation: "horizontal" as const, x: 50, y: 240, width: 496, height: 1, confidence: 1 },
      { kind: "line" as const, orientation: "horizontal" as const, x: 50, y: 250, width: 496, height: 1, confidence: 1 },
      { kind: "line" as const, orientation: "vertical" as const, x: 50, y: 100, width: 1, height: 151, confidence: 1 },
    ];
    expect(detectPageColumns({ pageNumber: 5, width: 595, height: 842, textItems: items, graphicsPrimitives }).isMultiColumn).toBe(true);
  });

  it("keeps split-span single-column text single without a region rect", () => {
    const items: ExtractedTextItem[] = [];
    for (let row = 0; row < 16; row += 1) {
      const y = 120 + row * 10;
      if (row % 4) {
        items.push({ text: `A single paragraph continues with ordinary prose to its line end ${row}`, x: 50, y, width: 496, height: 9, fontSize: 9, fontName: "Body", page: 5 });
      } else {
        items.push({ text: `A single paragraph begins ${row}`, x: 50, y, width: 110, height: 9, fontSize: 9, fontName: "Body", page: 5 });
        items.push({ text: "with ordinary prose and", x: 150, y, width: 210, height: 9, fontSize: 9, fontName: "Body", page: 5 });
        items.push({ text: "continues to the line end", x: 355, y, width: 191, height: 9, fontSize: 9, fontName: "Body", page: 5 });
      }
    }
    expect(detectPageColumns({ pageNumber: 5, width: 595, height: 842, textItems: items }).isMultiColumn).toBe(false);
  });

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
