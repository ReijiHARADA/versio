import { describe, expect, it } from "vitest";
import { reconstructDocument } from "../../services/pdfLayout";
import type { ExtractedTextItem } from "../../services/pdfService";

const item = (text: string, x: number, y: number, width: number, fontSize = 9): ExtractedTextItem => ({
  text, x, y, width, height: fontSize, fontSize, fontName: "Body", page: 1,
});
const prose = "results were consistent across every site and cohort in the study";

describe("equal-contribution note", () => {
  it("is a footnote with its wrapped line, even inside a copyright run", () => {
    const items: ExtractedTextItem[] = [
      item("COPYRIGHT © 2026 Author. This is an open-access article distributed under the terms of the", 50, 300, 136, 5.6),
      item("Creative Commons Attribution License (CC BY).", 50, 309, 120, 5.6),
      item("†These authors have contributed equally to", 50, 330, 136, 5.6),
      item("this work and share first authorship", 50, 339, 111, 7),
    ];
    for (let i = 0; i < 30; i += 1) items.push(item(`${prose} ${i}`, 50, 400 + i * 12, 490));
    const doc = reconstructDocument([{ pageNumber: 1, width: 595, height: 842, textItems: items }]);
    const note = doc.blocks.find((block) => block.text.includes("contributed equally"));
    expect(note?.role).toBe("footnote");
    expect(note?.text).toContain("share first authorship");
  });
});
