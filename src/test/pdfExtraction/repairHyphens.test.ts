import { describe, expect, it } from "vitest";
import { repairLineBreakHyphens } from "../../services/pdfExtraction/projection/repairHyphens";
import type { PaperBlock } from "../../types/paper";
import type { LayoutBlock } from "../../services/pdfLayout";

const p = (id: string, original: string, type: PaperBlock["type"] = "paragraph") => ({ id, type, original, metadata: {} }) as unknown as PaperBlock;
const layout = (...texts: string[]) => ({ lines: texts.map((text) => ({ text })) }) as unknown as LayoutBlock;

describe("repairLineBreakHyphens", () => {
  it("drops a line-end hyphen when the whole word appears elsewhere", () => {
    const out = repairLineBreakHyphens([
      p("a", "The plau-sible explanation held."),
      p("b", "A plausible explanation was preferred."),
    ], [layout("The plau-", "sible explanation held."), layout("A plausible explanation was preferred.")]);
    expect(out[0].original).toBe("The plausible explanation held.");
  });

  it("keeps a compound when it also appears mid-line", () => {
    const out = repairLineBreakHyphens([p("a", "A decision-support tool."), p("b", "The decision-support tool was adopted.")], [
      layout("A decision-", "support tool."),
      layout("The decision-support tool was adopted."),
    ]);
    expect(out[0].original).toBe("A decision-support tool.");
  });

  it("repairs both visible and metadata caption text", () => {
    const caption = p("f", "Figure 1: cate-gories", "figure");
    caption.metadata.captionOriginal = "Figure 1: cate-gories";
    const out = repairLineBreakHyphens([caption, p("a", "The categories are exhaustive.")], [
      layout("Figure 1: cate-", "gories"),
      layout("The categories are exhaustive."),
    ]);
    expect(out[0].original).toBe("Figure 1: categories");
    expect(out[0].metadata.captionOriginal).toBe("Figure 1: categories");
  });
});
