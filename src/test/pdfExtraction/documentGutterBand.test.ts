import { describe, expect, it } from "vitest";
import { reconstructDocument } from "../../services/pdfLayout";
import type { ExtractedTextItem } from "../../services/pdfService";

const item = (text: string, x: number, y: number, width: number, page: number): ExtractedTextItem => ({
  text, x, y, width, height: 9, fontSize: 9, fontName: "Body", page,
});
const prose = "results were consistent across every site and cohort in the study";

function twoColumnPage(page: number) {
  const items: ExtractedTextItem[] = [];
  for (let i = 0; i < 30; i += 1) {
    items.push(item(`${prose} left ${page}.${i}`, 57, 80 + i * 12, 234, page));
    items.push(item(`${prose} right ${page}.${i}`, 305, 80 + i * 12, 234, page));
  }
  return { pageNumber: page, width: 595, height: 791, textItems: items };
}

describe("two-column band on a page that fails column detection", () => {
  it("reads the left column of the band before the right column", () => {
    const items: ExtractedTextItem[] = [];
    // Full-width content dominates the page, so the page itself reads as single column.
    for (let i = 0; i < 30; i += 1) items.push(item(`wide row ${i} ${prose} ${prose}`, 57, 80 + i * 12, 482, 4));
    for (let i = 0; i < 3; i += 1) {
      items.push(item(`alpha${i} ${prose}`, 57, 600 + i * 12, 234, 4));
      items.push(item(`omega${i} ${prose}`, 305, 600 + i * 12, 234, 4));
    }
    const doc = reconstructDocument([1, 2, 3].map(twoColumnPage).concat([{ pageNumber: 4, width: 595, height: 791, textItems: items }]));
    const text = doc.lines.filter((line) => line.page === 4).map((line) => line.text).join(" ");
    const order = ["alpha0", "alpha1", "alpha2", "omega0", "omega1", "omega2"].map((word) => text.indexOf(word));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});
