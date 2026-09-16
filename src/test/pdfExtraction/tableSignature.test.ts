import { describe, expect, it } from "vitest";
import {
  buildCaptionAnchoredTableSignature,
  isLikelyTableContinuation,
  projectTableRegionBounds,
  graphicsEvidenceBounds,
  type ExtractedTextItem,
} from "../../services/pdfService";

const item = (text: string, x: number, y: number): ExtractedTextItem => ({
  text, x, y, width: 30, height: 10, fontSize: 9, fontName: "body", page: 1,
});

describe("table region evidence", () => {
  it("requires a caption anchor and does not classify ordinary prose", () => {
    const prose = [item("The table shows a result.", 20, 100), item("More prose.", 20, 120)];
    expect(buildCaptionAnchoredTableSignature(prose)).toBeNull();
  });

  it("builds a bounded signature below a fragmented Table caption", () => {
    const source = [item("Table", 20, 100), item("6", 55, 100), item("A", 20, 120), item("1", 80, 120)];
    const signature = buildCaptionAnchoredTableSignature(source);
    expect(signature).not.toBeNull();
    expect(signature?.bbox.y).toBeGreaterThanOrEqual(118);
    expect(signature?.columnX.length).toBe(2);
  });

  it("also anchors tables whose caption is below the grid", () => {
    const source = [item("A", 20, 100), item("1", 80, 100), item("B", 20, 120), item("2", 80, 120), item("Table", 20, 145), item("7", 55, 145)];
    const signature = buildCaptionAnchoredTableSignature(source);
    expect(signature).not.toBeNull();
    expect(signature?.bbox.y).toBeLessThan(140);
    expect(signature?.columnX.length).toBe(2);
  });

  it("requires structural evidence for continuation", () => {
    const base = { bbox: { x: 0, y: 0, width: 300, height: 200 }, columnX: [0, 100, 200], rowSpacing: [12, 12], horizontalRules: 4, verticalRules: 0, fontNames: ["body"], fontSize: 9 };
    const next = { ...base, columnX: [0, 100], horizontalRules: 0, verticalRules: 0 };
    expect(isLikelyTableContinuation(base, next)).toBe(false);
    expect(isLikelyTableContinuation(base, { ...base })).toBe(true);
  });

  it("clamps projected continuation bounds to the next page", () => {
    const bounds = projectTableRegionBounds({ x: 480, y: 0, width: 100, height: 200 }, 500, 700);
    expect(bounds).toEqual({ x: 480, y: 0, width: 20, height: 676 });
  });

  it("returns no bounds when a page has no vector evidence", () => {
    expect(graphicsEvidenceBounds([])).toBeNull();
  });
});
