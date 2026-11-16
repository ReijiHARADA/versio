import { describe, expect, it } from "vitest";
import { referenceLinesFromPages } from "../../services/pdfExtraction/crf/referenceLines";

const item = (text: string, x: number, y: number) => ({ text, x, y, width: text.length * 5, height: 10, fontSize: 10, fontName: "x", page: 1 });
const blocks = [{ boundingBoxes: [{ page: 1, x: 0, y: 0, width: 500, height: 500 }] }] as never;
describe("referenceLinesFromPages", () => {
  it("groups hanging-indent items and orders columns before vertical positions", () => {
    const lines = referenceLinesFromPages([{ pageNumber: 1, width: 500, height: 500, textItems: [item("[1]", 10, 100), item("Smith", 30, 100), item("continued", 30, 114), item("[2]", 260, 80), item("Jones", 280, 80)] }], blocks);
    expect(lines.map((line) => line.text)).toEqual(["[1] Smith", "continued", "[2] Jones"]);
    expect(lines[0].blockStart).toBe(true);
  });
});
