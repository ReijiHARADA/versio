import { describe, expect, it } from "vitest";
import { referenceLinesFromPages } from "../../services/pdfExtraction/crf/referenceLines";

const item = (text: string, x: number, y: number) => ({ text, x, y, width: text.length * 5, height: 10, fontSize: 10, fontName: "x", page: 1 });
const blocks = [
  { boundingBoxes: [{ page: 1, x: 0, y: 0, width: 240, height: 500 }] },
  { boundingBoxes: [{ page: 1, x: 250, y: 0, width: 250, height: 500 }] },
] as never;
describe("referenceLinesFromPages", () => {
  it("groups hanging-indent items and orders columns before vertical positions", () => {
    const lines = referenceLinesFromPages([{ pageNumber: 1, width: 500, height: 500, textItems: [item("[1]", 10, 100), item("Smith", 30, 100), item("continued", 30, 114), item("[2]", 260, 80), item("Jones", 280, 80)] }], blocks);
    expect(lines.map((line) => line.text)).toEqual(["[1] Smith", "continued", "[2] Jones"]);
    expect(lines[0].blockStart).toBe(true);
  });
  it("never merges left- and right-column lines at the same height", () => {
    const lines = referenceLinesFromPages([{ pageNumber: 1, width: 500, height: 500, textItems: [item("Antal M. (2025). Molecular", 10, 100), item("Bardoni R. (2013). Role", 260, 100)] }], blocks);
    expect(lines.map((line) => line.text)).toEqual(["Antal M. (2025). Molecular", "Bardoni R. (2013). Role"]);
  });
});

describe("selectReferenceBlocks", () => {
  it("ignores a subsection whose title merely mentions references", async () => {
    const { selectReferenceBlocks } = await import("../../services/pdfExtraction/crf/referenceLines");
    const blocks = [
      { id: "a", sectionId: "s1", type: "paragraph" },
      { id: "b", sectionId: "s2", type: "reference" },
    ] as never;
    const sections = [
      { id: "s1", normalizedKind: "references", originalTitle: "4.2.1 Quicker and Better Access to References" },
      { id: "s2", normalizedKind: "references", originalTitle: "References" },
    ];
    expect(selectReferenceBlocks(blocks, sections).map((b) => b.id)).toEqual(["b"]);
  });
});
