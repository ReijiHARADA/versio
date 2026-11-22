import { describe, expect, it } from "vitest";
import type { ExtractedPage } from "../../services/pdfService";
import { captionAnchoredGraphicsGrids } from "../../services/pdfExtraction/generic/tableRegions";

const rule = (x: number, y: number, width: number, height: number) => ({ type: "rect", x, y, width, height }) as never;
const text = (x: number, width: number) => ({ text: "w", x, y: 500, width, height: 8, fontSize: 8, fontName: "f" }) as never;
const page = (graphics: unknown[], items = [text(29, 537)]) =>
  ({ pageNumber: 1, width: 595, height: 842, textItems: items, graphicsPrimitives: graphics }) as unknown as ExtractedPage;
// Table box x66–530, y57–433, with inner rows.
const table = [rule(66, 57, 464, 1), rule(66, 432, 464, 1), rule(66, 57, 1, 376), rule(530, 57, 1, 376), rule(66, 200, 464, 1)];
const caption = { x: 73, y: 453, width: 320, height: 10 };

describe("captionAnchoredGraphicsGrids", () => {
  it("ignores a page frame that touches the table's top rule", () => {
    const frame = [rule(29, 57, 537, 1), rule(29, 57, 1, 715), rule(566, 57, 1, 715)];
    const [grid] = captionAnchoredGraphicsGrids(page([...frame, ...table]), caption);
    expect(grid).toMatchObject({ x: 66, y: 57, height: 376 });
  });

  it("keeps a long table's own side borders that sit inside the page text", () => {
    const long = [rule(62, 0, 471, 1), rule(62, 0, 1, 700), rule(533, 0, 1, 700), rule(62, 300, 471, 1)];
    const [grid] = captionAnchoredGraphicsGrids(page(long, [text(50, 497)]), { x: 63, y: 710, width: 300, height: 10 });
    expect(grid?.height).toBeGreaterThanOrEqual(700);
  });
});
