import { describe, expect, it } from "vitest";
import { dropDuplicateBylineRows } from "../../services/pdfExtraction/projection/bylineRows";
import type { PaperBlock } from "../../types/paper";

const block = (id: string, original: string, pageStart = 1): PaperBlock =>
  ({ id, paperId: "p", sectionId: null, type: "paragraph", order: 0, pageStart, pageEnd: pageStart, boundingBoxes: [], original, translated: null, extractionConfidence: null, translationStatus: "pending", parentBlockId: null, metadata: {} }) as PaperBlock;

describe("dropDuplicateBylineRows", () => {
  const authors = ["Ziyu Wang", "Chen Li", "Dongsheng Shang", "Linquan Jin", "Limin Liao"];
  it("drops a page-1 row made only of known author names", () => {
    const out = dropDuplicateBylineRows([block("a", "Chen Li1, Dongsheng Shang4, Linquan Jin4, Limin Liao1,"), block("b", "Body text about Chen Li and others.")], authors);
    expect(out.map((b) => b.id)).toEqual(["b"]);
  });
  it("keeps rows with other words, single names that end a sentence, and later pages", () => {
    const keep = [block("a", "Chen Li1, Dongsheng Shang4 and the Lab"), block("b", "Chen Li"), block("c", "Chen Li, Dongsheng Shang", 2)];
    expect(dropDuplicateBylineRows(keep, authors)).toHaveLength(3);
  });
});
