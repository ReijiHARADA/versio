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

const booktabs = (y: number, x = 60): PdfGraphicsPrimitive[] => [
  ...[0, 96, 194, 292, 390].map((offset) => ({ kind: "line" as const, orientation: "horizontal" as const, x: x + offset, y, width: 88, height: 1, confidence: 1 })),
];

const wideGapBooktabs = (y: number): PdfGraphicsPrimitive[] => [
  { kind: "line", orientation: "horizontal", x: 57, y, width: 258, height: 1, confidence: 1 },
  { kind: "line", orientation: "horizontal", x: 315, y, width: 33, height: 1, confidence: 1 },
  { kind: "line", orientation: "horizontal", x: 405, y, width: 59, height: 1, confidence: 1 },
  { kind: "line", orientation: "horizontal", x: 465, y, width: 30, height: 1, confidence: 1 },
  { kind: "line", orientation: "horizontal", x: 495, y, width: 44, height: 1, confidence: 1 },
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

  it("finds booktabs segmented rules with a caption above", () => {
    const regions = detectPageRegions(page({ graphicsPrimitives: [
      ...booktabs(140), ...booktabs(165), ...booktabs(360),
    ] }), [line("Table 1. Results", 60, 118, 440)], 10);
    expect(regions).toMatchObject([{ kind: "table", evidence: "rule-bands" }]);
    expect(regions[0].rect).toMatchObject({ x: 60, y: 140, width: 478, height: 221 });
  });

  it("splits two stacked booktabs tables at the second caption", () => {
    const regions = detectPageRegions(page({ graphicsPrimitives: [
      ...booktabs(140), ...booktabs(165), ...booktabs(360),
      ...booktabs(424), ...booktabs(440), ...booktabs(542),
    ] }), [line("Table 1. First", 60, 118, 440), line("Table 2. Second", 60, 400, 440)], 10);
    expect(regions).toMatchObject([
      { evidence: "rule-bands", rect: { y: 140, height: 221 } },
      { evidence: "rule-bands", rect: { y: 424, height: 119 } },
    ]);
  });

  it("ignores a single horizontal rule", () => {
    expect(detectPageRegions(page({ graphicsPrimitives: booktabs(140) }), [line("Table 1. Results", 60, 118, 440)], 10)).toEqual([]);
  });

  it("ignores rule bands without a caption", () => {
    expect(detectPageRegions(page({ graphicsPrimitives: [...booktabs(140), ...booktabs(165)] }), [], 10)).toEqual([]);
  });

  it("merges a repeated segment structure with a wide gap into one band", () => {
    const regions = detectPageRegions(page({ graphicsPrimitives: [
      ...wideGapBooktabs(140), ...wideGapBooktabs(165), ...wideGapBooktabs(360),
    ] }), [line("Table 1. Results", 57, 118, 482)], 10);
    expect(regions).toMatchObject([{ evidence: "rule-bands", rect: { x: 57, width: 482 } }]);
  });

  it("keeps a region for narrow body-size table cells", () => {
    const cells = Array.from({ length: 3 }, (_, index) =>
      line("I needed more time to acclimate to VR before entering the MC", 90, 170 + index * 16, 120));
    expect(detectPageRegions(page({ graphicsPrimitives: grid() }), [line("Table 1. Results", 80, 142), ...cells], 10))
      .toMatchObject([{ evidence: "ruled-grid" }]);
  });
});
