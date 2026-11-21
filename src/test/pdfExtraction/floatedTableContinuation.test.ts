import { describe, expect, it } from "vitest";
import type { CanonicalNode } from "../../services/pdfExtraction/canonical/types";
import type { PageColumnLayout } from "../../services/pdfLayout";
import { floatedTableContinuationRelations } from "../../services/pdfExtraction/resolver/relationResolver";

const node = (id: string, role: string, column: string, x: number, y: number, width: number, height: number, text: string) =>
  ({ id, role, column, text, pageStart: 8, pageEnd: 8, evidence: [], boundingBoxes: [{ page: 8, x, y, width, height }] }) as unknown as CanonicalNode;

describe("floatedTableContinuationRelations", () => {
  it("stitches a left-column paragraph past a full-width top table to the right column", () => {
    const nodes = [
      node("p1", "paragraph", "left", 49, 597, 251, 120, "c) Impact of LLM size: Examining the impact of LLM size on performance, we find that integrating SMs helps. We suspect"),
      node("cap", "caption", "right", 291, 67, 144, 9, "TABLE I SM-BASED METHODS."),
      node("tab", "table", "left", 119, 80, 379, 83, "HumanEval Modeling Clevr Direct SHERPA"),
      node("p2", "paragraph", "right", 312, 188, 251, 22, "that the benefits observed in smaller LLMs may also occur in larger LLMs when applied to more complex tasks."),
    ];
    const layouts = [{ page: 8, isMultiColumn: true, pageHeight: 792, pageWidth: 612 }] as unknown as PageColumnLayout[];
    expect(floatedTableContinuationRelations(nodes, layouts)).toEqual([expect.objectContaining({ kind: "CONTINUES", from: "p1", to: "p2" })]);
  });
});
