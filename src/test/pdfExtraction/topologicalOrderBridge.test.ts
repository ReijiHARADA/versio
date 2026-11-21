import { describe, expect, it } from "vitest";
import { topologicalOrder } from "../../services/pdfExtraction/resolver/relationResolver";

describe("topologicalOrder", () => {
  it("keeps the reading chain across a node left out of the ids", () => {
    const rel = (from: string, to: string) => ({ kind: "READS_BEFORE" as const, from, to, score: 0.9 });
    const y: Record<string, number> = { left: 500, right: 100 };
    // `label` (a figure label) is not projected; the caption in the right column must still follow the left one.
    const order = topologicalOrder(["left", "right"], [rel("left", "label"), rel("label", "right")], (id) => ({ page: 1, y: y[id], x: 0 }), (_from, to) => to === "right");
    expect(order).toEqual(["left", "right"]);
  });
});
