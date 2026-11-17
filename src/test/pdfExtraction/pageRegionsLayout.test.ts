import { describe, expect, it } from "vitest";
import { reconstructDocument } from "../../services/pdfLayout";
import type { ExtractedPage, ExtractedTextItem, PdfGraphicsPrimitive } from "../../services/pdfService";

const item = (text: string, x: number, y: number, width = 180, fontSize = 10): ExtractedTextItem =>
  ({ text, x, y, width, height: 10, fontSize, fontName: "Body", page: 2 });

const grid = (x = 50, y = 205): PdfGraphicsPrimitive[] => [
  { kind: "line", orientation: "horizontal", x, y, width: 170, height: 1, confidence: 1 },
  { kind: "line", orientation: "horizontal", x, y: y + 24, width: 170, height: 1, confidence: 1 },
  { kind: "line", orientation: "horizontal", x, y: y + 48, width: 170, height: 1, confidence: 1 },
  { kind: "line", orientation: "vertical", x, y, width: 1, height: 49, confidence: 1 },
  { kind: "line", orientation: "vertical", x: x + 85, y, width: 1, height: 49, confidence: 1 },
  { kind: "line", orientation: "vertical", x: x + 170, y, width: 1, height: 49, confidence: 1 },
];

const page = (textItems: ExtractedTextItem[], extras: Partial<ExtractedPage> = {}): ExtractedPage =>
  ({ pageNumber: 2, width: 500, height: 700, textItems, ...extras });

const prose = (label: string) => `${label} body sentence contains enough ordinary words to be treated as a paragraph line.`;

describe("page regions in reading order", () => {
  it("table rows leave the body flow", () => {
    const { blocks } = reconstructDocument([page([
      item(prose("Before one"), 50, 100), item(prose("Before two"), 50, 112),
      item("Table 1. Results", 50, 180), item("Metric  Value", 60, 215), item("Accuracy  0.91", 60, 227),
      item(prose("After one"), 50, 280), item(prose("After two"), 50, 292),
    ], { graphicsPrimitives: grid() })]);
    const caption = blocks.findIndex((block) => block.role === "table_caption");
    const table = blocks.findIndex((block) => block.role === "table");
    expect(table).toBeGreaterThan(caption);
    expect(blocks[table].text).toContain("Accuracy");
    expect(blocks.filter((block) => block.role === "paragraph").map((block) => block.text).join(" ")).toContain("After two");
  });

  it("figure text becomes chrome", () => {
    const { blocks } = reconstructDocument([page([
      item("(a)", 100, 220, 20, 11), item("Accuracy", 120, 235, 50, 11), item("Figure 1: Outcome", 80, 290, 180, 11),
    ], { imagePlacements: [{ id: "figure", x: 80, y: 200, width: 180, height: 110 }] })]);
    expect(blocks.some((block) => block.role === "paragraph" && /\(a\)|Accuracy/.test(block.text))).toBe(false);
    expect(blocks.some((block) => block.role === "chrome" && /\(a\)|Accuracy/.test(block.text))).toBe(true);
    expect(blocks.some((block) => block.role === "figure_caption" && /Figure 1/.test(block.text))).toBe(true);
  });

  it("column-width table keeps the other column order", () => {
    const left = Array.from({ length: 8 }, (_, index) => item(prose(`Left ${index}`), 50, 100 + index * 14, 180));
    const right = Array.from({ length: 8 }, (_, index) => item(prose(`Right ${index}`), 280, 100 + index * 14, 180));
    const { blocks } = reconstructDocument([page([
      ...left, ...right, item("Table 1. Results", 50, 240), item("Metric  Value", 60, 275), item("Accuracy  0.91", 60, 299),
    ], { graphicsPrimitives: grid(50, 265) })]);
    const rightText = blocks.flatMap((block) => block.lines).filter((line) => /^Right \d/.test(line.text)).map((line) => line.text);
    expect(rightText).toEqual(right.map((entry) => entry.text));
  });

  it("two tables on one page remain next to their captions", () => {
    const { blocks } = reconstructDocument([page([
      item("Table 1. First", 50, 150), item("A  1", 60, 185),
      item("Table 2. Second", 50, 300), item("B  2", 60, 335),
    ], { graphicsPrimitives: [...grid(50, 175), ...grid(50, 325)] })]);
    const tableIndexes = blocks.map((block, index) => block.role === "table" ? index : -1).filter((index) => index >= 0);
    expect(tableIndexes).toHaveLength(2);
    expect(blocks[tableIndexes[0]].text).toContain("A 1");
    expect(blocks[tableIndexes[1]].text).toContain("B 2");
  });

  it("no regions keeps identical output", () => {
    const textItems = [item(prose("One"), 50, 100), item(prose("Two"), 50, 115)];
    const plain = reconstructDocument([page(textItems)]).blocks.map((block) => [block.role, block.text]);
    const ignoredImage = reconstructDocument([page(textItems, { imagePlacements: [{ id: "background", x: 0, y: 0, width: 500, height: 700 }] })]).blocks.map((block) => [block.role, block.text]);
    expect(ignoredImage).toEqual(plain);
  });

  it("overlapping regions emit each line once", () => {
    const vectors = Array.from({ length: 20 }, (_, index) => ({
      kind: "line" as const, orientation: "other" as const, x: 110 + (index % 5) * 2, y: 220 + Math.floor(index / 5) * 2, width: 5, height: 5, confidence: 1,
    }));
    const { lines } = reconstructDocument([page([
      item("(a)", 110, 220, 20, 11), item("Figure 1: Outcome", 80, 310, 180, 11),
    ], { imagePlacements: [{ id: "image", x: 80, y: 200, width: 180, height: 120 }], graphicsPrimitives: vectors })]);
    expect(lines.filter((line) => line.text === "(a)")).toHaveLength(1);
  });
});
