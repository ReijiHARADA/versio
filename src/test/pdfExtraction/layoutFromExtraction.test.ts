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

  it("returns a complete narrative sentence from a geometry-only table fallback", () => {
    const block = {
      id: "narrative-fallback",
      paperId: "paper",
      order: 0,
      type: "table",
      original: "Besides the couple, who else is the main character in the clip?",
      translated: null,
      translationStatus: "skipped",
      pageStart: 4,
      pageEnd: 4,
      boundingBoxes: [{ page: 4, x: 212, y: 129, width: 71, height: 31 }],
      parentBlockId: null,
      extractionConfidence: 0.9,
      metadata: {
        tableSourceFallback: true,
        role: "table",
        evidence: [
          { label: "paragraph", confidence: 0.86 },
          { label: "table-row-geometry", confidence: 0.96 },
        ],
      },
    } as PaperBlock;
    const layoutBlocks: LayoutBlock[] = [{
      role: "table" as const,
      text: block.original!,
      pageStart: 4,
      pageEnd: 4,
      column: "left" as const,
      bbox: { page: 4, x: 212, y: 129, width: 71, height: 31 },
      lines: [],
    }];

    const [result] = attachLinesToBlocks([block], layoutBlocks);
    expect(result.type).toBe("paragraph");
    expect(result.translationStatus).toBe("pending");
    expect(result.metadata.packageRoleRepair).toBe("narrative-table-fallback-demoted");
  });

  it("joins a wrapped native cell even when another column occupies the intervening row", () => {
    const block = {
      id: "wrapped-cell",
      paperId: "paper",
      order: 0,
      type: "table",
      original: "To identify groups of similar Clustering observations.",
      translated: null,
      translationStatus: "skipped",
      pageStart: 18,
      pageEnd: 18,
      boundingBoxes: [{ page: 18, x: 72, y: 417, width: 220, height: 27 }],
      parentBlockId: null,
      extractionConfidence: 0.9,
      metadata: {},
    } as PaperBlock;
    const line = (text: string, x: number, y: number, width: number) => ({
        text,
        items: [{ text, x, y, width, height: 7, fontSize: 8, fontName: "body", page: 18 }],
        page: 18,
        column: "single" as const,
        x,
        y,
        width,
        height: 7,
        fontSize: 8,
        bbox: { page: 18, x, y, width, height: 7 },
    });
    const [result] = attachLinesToBlocks([block], [{
      role: "table" as const,
      text: block.original!,
      pageStart: 18,
      pageEnd: 18,
      column: "single" as const,
      bbox: { page: 18, x: 72, y: 417, width: 220, height: 27 },
      lines: [
        line("To identify groups of similar", 166, 417, 125),
        line("Clustering", 72, 425, 45),
        line("observations.", 166, 433, 60),
      ],
    }]);
    expect(result.metadata.tableRows).toEqual([
      [{ text: "To identify groups of similar observations.", x: 166, width: 125 }],
      [{ text: "Clustering", x: 72, width: 45 }],
    ]);
  });

  it("folds a full-width captioned grid across PDF column labels", () => {
    const caption = {
      id: "caption",
      paperId: "paper",
      order: 0,
      type: "table",
      original: "TABLE 1 Examples",
      translated: null,
      translationStatus: "skipped",
      pageStart: 4,
      pageEnd: 4,
      boundingBoxes: [{ page: 4, x: 50, y: 80, width: 70, height: 8 }],
      parentBlockId: null,
      extractionConfidence: 0.9,
      metadata: {
        captionOriginal: "TABLE 1 Examples",
        column: "left",
        tableRows: [[{ text: "TABLE 1", x: 50, width: 30 }]],
      },
    } as PaperBlock;
    const fragment = (id: string, x: number, y: number): PaperBlock => ({
      id,
      paperId: "paper",
      order: Number(id.slice(-1)) + 1,
      type: "table",
      original: `A. Option ${id}`,
      translated: null,
      translationStatus: "skipped",
      pageStart: 4,
      pageEnd: 4,
      boundingBoxes: [{ page: 4, x, y, width: 32, height: 8 }],
      parentBlockId: null,
      extractionConfidence: 0.9,
      metadata: {
        column: "right",
        tableSourceFallback: true,
        tableRows: [[{ text: `A. Option ${id}`, x, width: 32 }]],
      },
    });
    const result = attachLinesToBlocks([
      caption,
      fragment("1", 300, 110),
      fragment("2", 468, 125),
      fragment("3", 300, 140),
      fragment("4", 468, 155),
    ], []);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("caption");
    expect(result[0].metadata.captionOwnedNativeGrid).toBe(true);
    expect((result[0].metadata.tableRows as Array<Array<{ text: string }>>).flat().map((cell) => cell.text)).toContain("A. Option 1");
  });
});
