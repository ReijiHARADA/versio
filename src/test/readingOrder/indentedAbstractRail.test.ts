import { describe, expect, it } from "vitest";
import { reconstructDocument } from "../../services/pdfLayout";

describe("indented abstract above two-column body", () => {
  it("keeps a body line whose first span starts left of the abstract indent", () => {
    const at = (text: string, x: number, y: number, width: number) => ({ text, x, y, width, height: 10.9, fontSize: 11, fontName: "Body", page: 1 });
    const textItems = [];
    // Indented abstract (x 88) fills most of the left column, so leftX lands right of the body origin (x 71).
    for (let i = 0; i < 24; i++) {
      textItems.push(at(`abstract words line ${i} keep going through the indented block`, 88, 200 + i * 13.5, 185));
      textItems.push(at(`right column prose line ${i} continues the running text here`, 306, 200 + i * 13.5, 218));
    }
    textItems.push(at("With the availability of large datasets and pretrained", 71, 560, 218));
    textItems.push(at("in recent years.", 71, 573.5, 70.5));
    textItems.push(at("Conducting effective linguistic", 149.2, 573.5, 140));
    const { blocks } = reconstructDocument([{ pageNumber: 1, width: 595, height: 842, textItems }]);
    expect(blocks.map((b) => b.text).join("\n")).toContain("in recent years. Conducting effective linguistic");
  });
});
