import { describe, expect, it } from "vitest";
import { reconstructDocument } from "../../services/pdfLayout";
import type { ExtractedTextItem } from "../../services/pdfService";

const line = (text: string, y: number, fontSize: number, width = 240): ExtractedTextItem => ({
  text, x: 72, y, width, height: fontSize, fontSize, fontName: fontSize > 9.5 ? "Bold" : "Body", page: 2,
});
const body = (y: number) => line("the model was trained on the full sample and evaluated on held out data again", y, 9, 468);

function blocksFor(head: ExtractedTextItem[], afterY: number) {
  const items = [...head];
  for (let i = 0; i < 8; i += 1) items.push(body(afterY + i * 12));
  return reconstructDocument([{ pageNumber: 2, width: 612, height: 792, textItems: items }]).blocks;
}

describe("wrapped section headings", () => {
  it("keeps sentence-case heading lines at display size in one heading", () => {
    const blocks = blocksFor([
      line("3.2 Advancement of earning growth", 200, 12),
      line("forecasting through optuna and hyperopt", 214, 12),
      line("optimization", 228, 12, 70),
    ], 250);
    const heading = blocks.find((block) => block.role === "heading");
    expect(heading?.text).toBe("3.2 Advancement of earning growth forecasting through optuna and hyperopt optimization");
  });

  it("does not absorb same-size body text after a run-in bold heading", () => {
    const blocks = blocksFor([line("Identifying FTD rating scales", 200, 9, 120)], 214);
    expect(blocks.find((block) => block.role === "heading")?.text ?? "").not.toContain("model was trained");
  });
});
