import { describe, expect, it } from "vitest";
import { reconstructDocument } from "../../services/pdfLayout";
import type { ExtractedTextItem } from "../../services/pdfService";

const item = (text: string, x: number, y: number, width: number, fontSize = 9): ExtractedTextItem => ({
  text, x, y, width, height: fontSize, fontSize, fontName: "Body", page: 1,
});
const prose = "results were consistent across every site and cohort in the study";

describe("full-width caption cut at the gutter", () => {
  it("gives the right half of a caption row back to the caption", () => {
    const items: ExtractedTextItem[] = [];
    items.push(item("FIGURE 5", 62, 373, 25, 5.5));
    // The row as separate runs (panel letters in another font), as the real PDF emits it.
    const runs: Array<[string, number, number]> = [
      ["Assessment tasks commonly used", 62.4, 188.9], ["a", 251.3, 3.7], [") Walk straight, U shape, S sh", 254.9, 105.7],
      ["31", 360.6, 7.2], ["], (", 367.8, 7.5], ["b", 375.3, 4.2], [") TUG [", 379.5, 22.2], ["39", 401.7, 8.1],
      ["], (", 409.7, 7.5], ["c", 417.2, 3.8], [") Postural Stability [", 421.1, 59.9], ["24", 481, 8.1],
      ["], (", 489.1, 7.5], ["d", 496.6, 4.2], [") Staircase", 500.8, 32.2],
    ];
    for (const [text, x, width] of runs) items.push({ ...item(text, x, 382, width, 7), fontName: text.length === 1 ? "Italic" : "Caption" });
    items.push(item("Climbing [40], (e) ADL careplanit.", 62, 391, 107, 7));
    for (let i = 0; i < 25; i += 1) {
      items.push(item(`${prose} left ${i}`, 50, 420 + i * 12, 241));
      items.push(item(`${prose} right ${i}`, 305, 420 + i * 12, 241));
    }
    const doc = reconstructDocument([{ pageNumber: 1, width: 595, height: 842, textItems: items }]);
    const caption = doc.blocks.find((block) => block.role === "figure_caption");
    expect(caption?.text).toMatch(/a ?\) Walk straight/);
    expect(caption?.text.indexOf("Walk straight")).toBeLessThan(caption?.text.indexOf("Climbing") ?? -1);
    expect(doc.blocks.some((block) => block.role !== "figure_caption" && block.text.includes("Walk straight"))).toBe(false);
  });
});
