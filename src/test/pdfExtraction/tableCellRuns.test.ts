import { describe, expect, it } from "vitest";
import { collapseTableCellRuns } from "../../services/pdfExtraction/projection/tableCellRuns";
import type { PaperBlock } from "../../types/paper";

const p = (id: string, original: string, type: PaperBlock["type"] = "paragraph") =>
  ({ id, type, original, sectionId: "s", pageStart: 6, pageEnd: 6, boundingBoxes: [], metadata: {}, order: 0, translationStatus: "pending" }) as unknown as PaperBlock;
const sections = [{ id: "s", normalizedKind: "results" as const }];

describe("collapseTableCellRuns", () => {
  it("turns a run of table cells read as paragraphs into one source-only table block", () => {
    const cells = ["Hospital,", "Pharmacy,", "Significant reduction in", "Resilience,", "Kojima et al.", "Engineering,", "Japan", "2023", "[34]"].map((t, i) => p(`c${i}`, t));
    const out = collapseTableCellRuns([p("a", "We summarise the included studies below and describe each of them in turn."), ...cells, p("b", "Most studies reported a reduction in dispensing errors after the change.")], sections);
    expect(out.map((b) => b.type)).toEqual(["paragraph", "table", "paragraph"]);
    expect(out[1].original).toMatch(/^Hospital, Pharmacy, .* \[34\]$/);
    expect(out[1].translationStatus).toBe("skipped");
  });

  it("leaves body prose, short runs and reference lists alone", () => {
    const prose = Array.from({ length: 9 }, (_, i) => p(`p${i}`, `Paragraph ${i} describes one finished step of the method in a complete sentence.`));
    expect(collapseTableCellRuns(prose, sections).every((b) => b.type === "paragraph")).toBe(true);
    const short = ["Hospital,", "Japan", "2023"].map((t, i) => p(`c${i}`, t));
    expect(collapseTableCellRuns(short, sections)).toHaveLength(3);
    const refs = Array.from({ length: 9 }, (_, i) => ({ ...p(`r${i}`, "Smith J,"), sectionId: "r" }));
    expect(collapseTableCellRuns(refs, [{ id: "r", normalizedKind: "references" }])).toHaveLength(9);
  });
});
