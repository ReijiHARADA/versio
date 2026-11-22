import { describe, expect, it } from "vitest";
import { reconstructDocument } from "../../services/pdfLayout";
import type { ExtractedTextItem } from "../../services/pdfService";

const item = (text: string, x: number, y: number, width: number, fontSize = 9): ExtractedTextItem => ({
  text, x, y, width, height: fontSize, fontSize, fontName: "Body", page: 1,
});
const prose = "results were consistent across every site and cohort in the study";

describe("in-text table reference at a line start", () => {
  it("stays in its paragraph instead of opening a table caption", () => {
    const items: ExtractedTextItem[] = [];
    for (let i = 0; i < 20; i += 1) items.push(item(`${prose} ${i}`, 50, 100 + i * 12, 490));
    items.push(item("The characteristics of the interview participants are summarized in", 50, 400, 490));
    items.push(item("Table 6.", 50, 412, 40));
    items.push(item("Participants consistently highlighted the absence of a unified framework", 62, 436, 478));
    const doc = reconstructDocument([{ pageNumber: 1, width: 595, height: 842, textItems: items }]);
    expect(doc.blocks.some((block) => block.role === "table_caption")).toBe(false);
    expect(doc.blocks.find((block) => block.text.includes("summarized in"))?.text).toMatch(/summarized in Table 6\./);
  });
});
