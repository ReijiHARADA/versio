import { describe, expect, it } from "vitest";
import { textItemGeometry } from "../services/pdfService";

describe("textItemGeometry", () => {
  it("uses the glyph top for native vertical text so its region stays on-page", () => {
    const viewport = { height: 300, convertToViewportPoint: (x: number, y: number): [number, number] => [x, 300 - y] };
    const geometry = textItemGeometry({ transform: [0, 10, -10, 0, 100, 200], width: 5, height: 10 }, viewport);

    expect(geometry.rotation).toBe(90);
    expect(geometry.y).toBe(95);
    expect(geometry.height).toBe(5);
    expect(geometry.visualTop).toBe(95);
  });
});
