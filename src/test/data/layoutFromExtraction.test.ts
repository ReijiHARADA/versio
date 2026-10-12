import { describe, expect, it } from "vitest";
import { attachLinesToBlocks } from "../../data/package/layoutFromExtraction";
import type { LayoutBlock } from "../../services/pdfLayout";
import type { PaperBlock } from "../../types/paper";

function block(type: PaperBlock["type"], original: string): PaperBlock {
  return {
    id: `b-${type}`,
    paperId: "p-1",
    sectionId: null,
    type,
    order: 0,
    pageStart: 1,
    pageEnd: 1,
    boundingBoxes: [],
    original,
    translated: null,
    extractionConfidence: 0.9,
    translationStatus: "skipped",
    parentBlockId: null,
    metadata: {},
  };
}

describe("attachLinesToBlocks", () => {
  it("retains native table cells as row evidence without adding them to prose", () => {
    const tableText = "Finger Thumb Finger1 Finger2";
    const layout = {
      pageStart: 1,
      text: tableText,
      lines: [{
        text: tableText,
        items: [
          { text: "Finger", x: 40, width: 35 },
          { text: "Thumb", x: 100, width: 38 },
          { text: "Finger1", x: 170, width: 44 },
          { text: "Finger2", x: 240, width: 44 },
        ],
        bbox: { page: 1, x: 40, y: 100, width: 244, height: 10 },
        y: 100,
        height: 10,
        fontSize: 9,
      }],
    } as unknown as LayoutBlock;

    const [table, paragraph] = attachLinesToBlocks(
      [block("table", tableText), block("paragraph", "Ordinary body text.")],
      [layout]
    );

    expect(table.metadata.tableRows).toEqual([[
      { text: "Finger", x: 40, width: 35 },
      { text: "Thumb", x: 100, width: 38 },
      { text: "Finger1", x: 170, width: 44 },
      { text: "Finger2", x: 240, width: 44 },
    ]]);
    expect(paragraph.metadata.tableRows).toBeUndefined();
  });
});
