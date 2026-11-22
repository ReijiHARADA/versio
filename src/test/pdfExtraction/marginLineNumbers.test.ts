import { describe, expect, it } from "vitest";
import { stripMarginLineNumbers } from "../../services/pdfLayout";
import type { ExtractedPage, ExtractedTextItem } from "../../services/pdfService";

const item = (text: string, x: number, y: number, width: number): ExtractedTextItem => ({
  text, x, y, width, height: 11, fontSize: 11, fontName: "Body", page: 1,
});
const page = (items: ExtractedTextItem[], pageNumber = 1): ExtractedPage => ({ pageNumber, width: 612, height: 792, textItems: items });

describe("stripMarginLineNumbers", () => {
  it("drops a counting column of margin numbers and keeps the text", () => {
    const items: ExtractedTextItem[] = [];
    for (let i = 0; i < 12; i += 1) {
      const n = String(21 + i);
      items.push(item(n, 77 - n.length * 6, 100 + i * 20, n.length * 6), item(`line ${i} of the running text`, 94, 100 + i * 20, 420));
    }
    const out = stripMarginLineNumbers([1, 2, 3].map((n) => page(items, n)));
    expect(out[2].textItems).toHaveLength(12);
    expect(out[2].textItems.every((t) => t.text.startsWith("line"))).toBe(true);
    // The same column on one page of ten is a table's row numbers.
    const plain = page([item("Body text of the paper", 94, 100, 420)], 2);
    expect(stripMarginLineNumbers([page(items), ...Array.from({ length: 9 }, () => plain)])[0].textItems).toHaveLength(24);
  });

  it("keeps numbers that do not count down the page (a table column)", () => {
    const values = [12, 7, 30, 4, 18, 9, 22, 3, 15, 11];
    const items = values.map((v, i) => item(String(v), 60, 100 + i * 20, 12));
    expect(stripMarginLineNumbers([1, 2, 3].map((n) => page(items, n)))[0].textItems).toHaveLength(values.length);
  });
});
