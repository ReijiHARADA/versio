import { describe, expect, it } from "vitest";
import { repairLineBreakHyphens } from "../../services/pdfExtraction/projection/repairHyphens";
import type { PaperBlock } from "../../types/paper";

const p = (id: string, original: string, type: PaperBlock["type"] = "paragraph") => ({ id, type, original, metadata: {} }) as unknown as PaperBlock;

describe("repairLineBreakHyphens", () => {
  it("drops a line-break hyphen inside a broken word and keeps real compounds", () => {
    const out = repairLineBreakHyphens([
      p("a", "About 23% of workers have experi-enced violence under a support-ive leadership style."),
      p("b", "Well-being and self-report measures were collected in a cross-sectional design."),
    ]);
    expect(out[0].original).toBe("About 23% of workers have experienced violence under a supportive leadership style.");
    expect(out[1].original).toBe("Well-being and self-report measures were collected in a cross-sectional design.");
  });

  it("joins when the whole word is written elsewhere in the document", () => {
    const out = repairLineBreakHyphens([p("h", "Methodology", "heading"), p("a", "The method-ology follows earlier work.")]);
    expect(out[1].original).toBe("The methodology follows earlier work.");
  });
});
