import { describe, expect, it } from "vitest";
import { overlayBoxFromExtraction } from "../../evaluation/overlayCoordinates";
import { overlayTextBbox } from "../../services/pdfLayout";

describe("overlayBoxFromExtraction", () => {
  const box = { page: 1, x: 40, y: 100, width: 120, height: 12 };

  it("converts an unrotated native text baseline to a canvas top-left box", () => {
    expect(overlayBoxFromExtraction(box, { hasText: true, pageRotation: 0, role: "paragraph" }))
      .toEqual({ ...box, y: 88 });
  });

  it("does not apply a second baseline shift after PDF.js has rotated a page", () => {
    expect(overlayBoxFromExtraction(box, { hasText: true, pageRotation: 90, role: "paragraph" }))
      .toEqual(box);
  });

  it("leaves manually drawn and graphic regions in their top-left coordinate space", () => {
    expect(overlayBoxFromExtraction(box, { hasText: false, pageRotation: 0, role: "figure" }))
      .toEqual(box);
  });

  it("repairs only the legacy wide vertical copyright geometry", () => {
    expect(overlayBoxFromExtraction({ page: 1, x: 32, y: 555, width: 337.74, height: 20 }, { hasText: true, pageRotation: 0, role: "copyright" }))
      .toEqual({ page: 1, x: 12, y: 217.26, width: 20, height: 337.74 });
  });
});

describe("overlayTextBbox", () => {
  it("uses true glyph extrema instead of subtracting an aggregate math-line height", () => {
    const items = [
      { text: "x", x: 100, y: 200, width: 8, height: 10, fontSize: 10, fontName: "Test", page: 1 },
      // Superscript: its baseline is higher, but it must not move the main
      // line's bottom edge or expand the UI box upward by the full union height.
      { text: "2", x: 109, y: 194, width: 5, height: 6, fontSize: 6, fontName: "Test", page: 1 },
    ];
    expect(overlayTextBbox(items, 1)).toEqual({ page: 1, x: 100, y: 188, width: 14, height: 12 });
  });

  it("uses the transformed glyph top for vertical native text", () => {
    expect(overlayTextBbox([{ text: "side", x: 10, y: 52, width: 8, height: 40, fontSize: 8, fontName: "Test", page: 1, rotation: 90, visualTop: 12 }], 1))
      .toEqual({ page: 1, x: 10, y: 12, width: 8, height: 40 });
  });
});
