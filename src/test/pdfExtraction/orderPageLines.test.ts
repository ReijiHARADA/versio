import { describe, expect, it } from "vitest";
import { reconstructDocument } from "../../services/pdfLayout";
import type { ExtractedPage, ExtractedTextItem } from "../../services/pdfService";

const item = (text: string, x: number, y: number, width = 200): ExtractedTextItem =>
  ({ text, x, y, width, height: 10, fontSize: 10, fontName: "Body", page: 2 });

const twoColumnPage = (extras: ExtractedTextItem[]): ExtractedPage => ({
  pageNumber: 2,
  width: 600,
  height: 700,
  textItems: [
    ...Array.from({ length: 8 }, (_, index) => item(`Left body ${index}`, 50, 100 + index * 35)),
    ...Array.from({ length: 8 }, (_, index) => item(`Right body ${index}`, 330, 100 + index * 35)),
    ...extras,
  ],
});

describe("spanning reading-order cuts", () => {
  it("keeps a column label on the same baseline as, and before, a spanning caption", () => {
    const { lines } = reconstructDocument([twoColumnPage([
      item("Table 2", 50, 190, 80),
      item("Table 2. Spanning caption", 160, 190, 390),
    ])]);
    expect(lines.map((line) => line.text).indexOf("Table 2")).toBeLessThan(lines.map((line) => line.text).indexOf("Table 2. Spanning caption"));
  });

  it("emits every line exactly once across three spanning cuts", () => {
    const expected = ["Cut one", "Cut two", "Cut three", "Near one", "Near two", "Near three"];
    const { lines } = reconstructDocument([twoColumnPage([
      item("Near one", 50, 190, 70), item("Cut one", 160, 190, 390),
      item("Near two", 50, 260, 70), item("Cut two", 160, 260, 390),
      item("Near three", 50, 330, 70), item("Cut three", 160, 330, 390),
    ])]);
    for (const text of expected) expect(lines.filter((line) => line.text === text)).toHaveLength(1);
  });
});
