import { describe, expect, it } from "vitest";
import { reconstructDocument } from "../../services/pdfLayout";
import type { ExtractedPage, ExtractedTextItem } from "../../services/pdfService";

const item = (page: number, text: string, x: number, y: number, width: number, fontSize: number): ExtractedTextItem =>
  ({ text, x, y, width, height: fontSize, fontSize, fontName: fontSize === 10 ? "Body" : "Small", page });
const bodyLine = (n: number) => `Body sentence ${n} describes the study design and its measured outcomes in ordinary prose words.`;
const bodyPage = (page: number, from = 0, count = 30): ExtractedTextItem[] =>
  Array.from({ length: count }, (_, i) => item(page, bodyLine(from + i), 72, 80 + i * 14, 468, 10));
// A borderless review table whose cells hold sentences, set smaller than the body.
const tableRows = (page: number, top: number): ExtractedTextItem[] =>
  Array.from({ length: 12 }, (_, i) => [
    item(page, `Author ${i} et al. (${i + 10})`, 50, top + i * 30, 90, 7),
    item(page, `To examine how the intervention ${i} changed outcomes in the cohort.`, 150, top + i * 30, 200, 7),
    item(page, `Participants reported higher satisfaction after the program ${i}.`, 360, top + i * 30, 200, 7),
  ]).flat();

const pages = (second: ExtractedTextItem[]): ExtractedPage[] => [
  { pageNumber: 1, width: 612, height: 792, textItems: bodyPage(1) },
  { pageNumber: 2, width: 612, height: 792, textItems: second },
];

describe("table-only page text", () => {
  it("keeps small-font rows on a captioned page without body prose out of paragraphs", () => {
    const { blocks } = reconstructDocument(pages([item(2, "TABLE 3 (Continued)", 50, 50, 90, 7), ...tableRows(2, 80)]));
    const page2 = blocks.filter((block) => block.pageStart === 2);
    expect(page2.filter((block) => block.role === "paragraph")).toHaveLength(0);
    expect(page2.some((block) => block.role === "table" && block.tablePageText)).toBe(true);
    expect(blocks.filter((block) => block.pageStart === 1).every((block) => block.role !== "table")).toBe(true);
  });

  it("leaves small-font text alone on a captioned page that also carries body prose", () => {
    const { blocks } = reconstructDocument(pages([
      ...bodyPage(2, 100, 20),
      item(2, "Table 3 Summary of the included studies", 50, 380, 160, 7),
      item(2, "Notes. The values summarise answers from the participants in each of the included cohorts.", 72, 400, 468, 7),
    ]));
    expect(blocks.some((block) => block.tablePageText)).toBe(false);
  });
});
