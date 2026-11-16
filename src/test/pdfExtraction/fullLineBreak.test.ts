import { describe, expect, it } from "vitest";
import { reconstructDocument } from "../../services/pdfLayout";
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
