import { describe, expect, it } from "vitest";
import { detectPageRegions, lineInRegion } from "../../services/pdfExtraction/layout/pageRegions";
import type { LayoutLine } from "../../services/pdfLayout";
import type { ExtractedPage, PdfGraphicsPrimitive } from "../../services/pdfService";

const page = (overrides: Partial<ExtractedPage> = {}): ExtractedPage => ({
  pageNumber: 1,
  width: 500,
  height: 700,
  textItems: [],
  ...overrides,
});

const line = (text: string, x: number, y: number, width = 180, fontSize = 10): LayoutLine => ({
  text,
  items: [],
  page: 1,
  column: "single",
  x,
  y,
  width,
  height: 10,
  fontSize,
  bbox: { page: 1, x, y, width, height: 10 },
});

const grid = (x = 80, y = 160): PdfGraphicsPrimitive[] => [
  { kind: "line", orientation: "horizontal", x, y, width: 220, height: 1, confidence: 1 },
  { kind: "line", orientation: "horizontal", x, y: y + 30, width: 220, height: 1, confidence: 1 },
  { kind: "line", orientation: "horizontal", x, y: y + 60, width: 220, height: 1, confidence: 1 },
  { kind: "line", orientation: "vertical", x, y, width: 1, height: 61, confidence: 1 },
  { kind: "line", orientation: "vertical", x: x + 110, y, width: 1, height: 61, confidence: 1 },
  { kind: "line", orientation: "vertical", x: x + 220, y, width: 1, height: 61, confidence: 1 },
];

describe("detectPageRegions", () => {
  it("finds a ruled grid with a table caption above", () => {
    const regions = detectPageRegions(page({ graphicsPrimitives: grid() }), [line("Table 1. Results", 80, 142)], 10);
    expect(regions).toMatchObject([{ kind: "table", evidence: "ruled-grid" }]);
    expect(regions[0].rect.x).toBeLessThanOrEqual(80);
    expect(regions[0].rect.y).toBeLessThanOrEqual(160);
    expect(regions[0].rect.x + regions[0].rect.width).toBeGreaterThanOrEqual(300);
  });

  it("finds a grid when its caption is below", () => {
    expect(detectPageRegions(page({ graphicsPrimitives: grid() }), [line("Table 1. Results", 80, 225)], 10)).toHaveLength(1);
  });

  it("ignores a grid without a caption", () => {
    expect(detectPageRegions(page({ graphicsPrimitives: grid() }), [], 10)).toEqual([]);
  });

  it("finds an image with a figure caption below", () => {
    const regions = detectPageRegions(page({ imagePlacements: [{ id: "figure", x: 80, y: 120, width: 250, height: 140 }] }), [line("Figure 2: Outcome", 80, 270)], 10);
    expect(regions).toMatchObject([{ kind: "figure", evidence: "image" }]);
  });

  it("ignores full-page and tiny images", () => {
    const regions = detectPageRegions(page({ imagePlacements: [
      { id: "background", x: 0, y: 0, width: 500, height: 665 },
      { id: "icon", x: 10, y: 10, width: 50, height: 70 },
    ] }), [line("Figure 2: Outcome", 80, 270)], 10);
    expect(regions).toEqual([]);
  });

  it("finds a dense vector cluster with a figure caption", () => {
    const vectors = Array.from({ length: 20 }, (_, index) => ({
      kind: "line" as const, orientation: "other" as const, x: 100 + (index % 5) * 2, y: 140 + Math.floor(index / 5) * 2, width: 5, height: 5, confidence: 1,
    }));
    const regions = detectPageRegions(page({ graphicsPrimitives: vectors }), [line("Fig. 3: Diagram", 100, 160)], 10);
    expect(regions).toMatchObject([{ kind: "figure", evidence: "vector" }]);
  });

  it("drops a region that swallows consecutive prose", () => {
    const prose = Array.from({ length: 3 }, (_, index) => line("This is a deliberately long body sentence that must stay in the ordinary paragraph flow.", 90, 140 + index * 20, 220));
    expect(detectPageRegions(page({ imagePlacements: [{ id: "bad", x: 80, y: 120, width: 250, height: 140 }] }), [line("Figure 2: Outcome", 80, 270), ...prose], 10)).toEqual([]);
  });

  it("keeps the caption line outside the region", () => {
    const caption = line("Table 1. Results", 80, 142);
    const [region] = detectPageRegions(page({ graphicsPrimitives: grid() }), [caption], 10);
    expect(lineInRegion(caption, region)).toBe(false);
  });
});
