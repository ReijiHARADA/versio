import { describe, expect, it } from "vitest";
import { largestTypeTitle } from "../../services/pdfExtraction/projection/finalizePaperProjection";

const line = (text: string, y: number, fontSize: number) => ({ text, y, fontSize, page: 1, pageHeight: 792, items: [], bbox: { page: 1, x: 72, y, width: 400, height: fontSize } });
const block = (role: string, lines: ReturnType<typeof line>[]) => ({ role, text: lines.map((l) => l.text).join(" "), lines, pageStart: 1, pageEnd: 1, column: "single", bbox: lines[0].bbox });

describe("largestTypeTitle", () => {
  it("joins every line of the largest type, whatever role each line got", () => {
    const blocks = [
      block("author", [line("Network Community Detection and Novelty", 126, 14.3)]),
      block("title", [line("Scoring Reveal Underexplored Hub Genes in", 144, 14.3)]),
      block("author", [line("Rheumatoid Arthritis", 162, 14.3)]),
      block("affiliation", [line("Neda Amirirad and Hiroki Sayama", 193, 7.7)]),
      block("chrome", [line("arXiv:2509.00897v1 [q-bio.MN] 31 Aug 2025", 204, 20)]),
    ];
    expect(largestTypeTitle(blocks as never, 9)).toBe("Network Community Detection and Novelty Scoring Reveal Underexplored Hub Genes in Rheumatoid Arthritis");
  });
  it("returns null without type larger than the body", () => {
    expect(largestTypeTitle([block("paragraph", [line("Body text only here.", 100, 9)])] as never, 9)).toBeNull();
  });
});
