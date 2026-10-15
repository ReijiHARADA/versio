import { describe, expect, it } from "vitest";
import { attachLinesToBlocks } from "../../data/package/layoutFromExtraction";
import type { LayoutBlock } from "../../services/pdfLayout";
import type { PaperBlock } from "../../types/paper";

describe("package layout reconstruction", () => {
  it("recovers table cells when the projected text does not match one layout block", () => {
    const block = {
      id: "table-row",
      paperId: "paper",
      order: 0,
      type: "table",
      original: "Interface Explainability Google",
      translated: null,
      translationStatus: "skipped",
      pageStart: 7,
      pageEnd: 7,
      boundingBoxes: [
        { page: 7, x: 54, y: 77, width: 25, height: 7 },
        { page: 7, x: 114, y: 77, width: 40, height: 7 },
        { page: 7, x: 210, y: 77, width: 21, height: 7 },
      ],
      parentBlockId: null,
      extractionConfidence: 0.9,
      metadata: { figureKey: "table-region-row" },
    } as PaperBlock;
    const layoutBlocks: LayoutBlock[] = [
      ...[
        ["Interface", 54, 25],
        ["Explainability", 114, 40],
        ["Google", 210, 21],
      ].map(([text, x, width]) => ({
        role: "paragraph" as const,
        text: String(text),
        pageStart: 7,
        pageEnd: 7,
        column: "single" as const,
        bbox: { page: 7, x: Number(x), y: 77, width: Number(width), height: 7 },
        lines: [{
          text: String(text),
          items: [{ text: String(text), x: Number(x), y: 77, width: Number(width), height: 7, fontSize: 8, fontName: "body", page: 7 }],
          page: 7,
          column: "single" as const,
          x: Number(x),
          y: 77,
          width: Number(width),
          height: 7,
          fontSize: 8,
          bbox: { page: 7, x: Number(x), y: 77, width: Number(width), height: 7 },
        }],
      })),
    ];

    const [result] = attachLinesToBlocks([block], layoutBlocks);
    expect(result.metadata.tableRows).toEqual([[{
      text: "Interface", x: 54, width: 25,
    }, {
      text: "Explainability", x: 114, width: 40,
    }, {
      text: "Google", x: 210, width: 21,
    }]]);
  });
});
