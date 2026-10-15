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

  it("folds a caption-owned native grid into its numbered table when no crop exists", () => {
    const caption = {
      ...block("table", "Table 4. Functions"),
      id: "caption",
      boundingBoxes: [{ page: 1, x: 50, y: 220, width: 220, height: 10 }],
      metadata: { column: "left", captionOriginal: "Table 4. Functions", imageUrl: "" },
    };
    const grid = {
      ...block("table", "Finger Phonebook Gallery"),
      id: "grid",
      boundingBoxes: [{ page: 1, x: 50, y: 150, width: 210, height: 10 }],
      metadata: { column: "left", figureKey: "table-region-grid" },
    };
    const layout = {
      pageStart: 1,
      text: grid.original,
      lines: [{
        text: grid.original,
        items: [
          { text: "Finger", x: 50, width: 35 },
          { text: "Phonebook", x: 110, width: 55 },
          { text: "Gallery", x: 190, width: 45 },
        ],
        bbox: { page: 1, x: 50, y: 150, width: 185, height: 10 },
        y: 150,
        height: 10,
        fontSize: 9,
      }],
    } as unknown as LayoutBlock;

    const [table] = attachLinesToBlocks([grid, caption], [layout]);

    expect(table.id).toBe("caption");
    expect(table.metadata.captionOwnedNativeGrid).toBe(true);
    expect(table.metadata.tableRows).toEqual([[
      { text: "Finger", x: 50, width: 35 },
      { text: "Phonebook", x: 110, width: 55 },
      { text: "Gallery", x: 190, width: 45 },
    ]]);
  });

  it("keeps multiple single-cell table rows readable instead of flattening them", () => {
    const tableText = "Method\nPilot interviews\nHuman factors research";
    const layout = {
      pageStart: 1,
      text: tableText,
      lines: [
        "Method",
        "Pilot interviews",
        "Human factors research",
      ].map((text, index) => ({
        text,
        items: [{ text, x: 50, width: text.length * 5 }],
        bbox: { page: 1, x: 50, y: 100 + index * 14, width: text.length * 5, height: 10 },
        y: 100 + index * 14,
        height: 10,
        fontSize: 9,
      })),
    } as unknown as LayoutBlock;

    const [table] = attachLinesToBlocks([block("table", tableText)], [layout]);

    expect(table.metadata.tableRows).toEqual([
      [{ text: "Method", x: 50, width: 30 }],
      [{ text: "Pilot interviews", x: 50, width: 80 }],
      [{ text: "Human factors research", x: 50, width: 110 }],
    ]);
  });

  it("recovers repeated native cell rows near a numbered caption even when they projected as prose", () => {
    const caption = {
      ...block("table", "Table 8. Results"),
      id: "caption",
      boundingBoxes: [{ page: 1, x: 40, y: 230, width: 220, height: 10 }],
      metadata: { column: "left", captionOriginal: "Table 8. Results", imageUrl: "" },
    };
    const cells = [
      ["Method", "Score"],
      ["A", "0.21"],
      ["B", "0.42"],
    ].flatMap((row, rowIndex) => row.map((text, cellIndex) => ({
      ...block("paragraph", text),
      id: `cell-${rowIndex}-${cellIndex}`,
      boundingBoxes: [{ page: 1, x: 50 + cellIndex * 100, y: 170 + rowIndex * 16, width: 40, height: 10 }],
      metadata: { column: "left" },
    })));
    const layouts = cells.map((cell) => ({
      pageStart: 1,
      text: cell.original,
      lines: [{
        text: cell.original,
        items: [{ text: cell.original, x: cell.boundingBoxes[0].x, width: cell.boundingBoxes[0].width }],
        bbox: cell.boundingBoxes[0],
        y: cell.boundingBoxes[0].y,
        height: cell.boundingBoxes[0].height,
        fontSize: 9,
      }],
    } as unknown as LayoutBlock));

    const [table] = attachLinesToBlocks([...cells, caption], layouts);

    expect(table.id).toBe("caption");
    expect(table.metadata.captionOwnedNativeGrid).toBe(true);
    expect(table.metadata.tableRows).toEqual([
      [{ text: "Method", x: 50, width: 40 }, { text: "Score", x: 150, width: 40 }],
      [{ text: "A", x: 50, width: 40 }, { text: "0.21", x: 150, width: 40 }],
      [{ text: "B", x: 50, width: 40 }, { text: "0.42", x: 150, width: 40 }],
    ]);
  });
});
