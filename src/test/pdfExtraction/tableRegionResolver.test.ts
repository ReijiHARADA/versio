import { describe, expect, it } from "vitest";
import { resolveTableRegions } from "../../services/pdfExtraction/resolver/documentResolver";
import type { CanonicalNode } from "../../services/pdfExtraction/canonical/types";
import type { StructuralRegionEvidence } from "../../services/pdfExtraction/types";

const node = (id: string): CanonicalNode => ({
  id,
  role: "paragraph",
  text: "cell text",
  pageStart: 1,
  pageEnd: 1,
  boundingBoxes: [{ page: 1, x: 10, y: 10, width: 40, height: 10 }],
  confidence: 0.7,
  evidence: [],
  sourceAnchor: { page: 1, boundingBoxes: [] },
});

const region = (members: string[], confidence: number): StructuralRegionEvidence => ({
  id: "table-1",
  kind: "table",
  pageStart: 1,
  pageEnd: 1,
  boundingBoxes: [{ page: 1, x: 10, y: 10, width: 100, height: 40 }],
  captionCandidateId: undefined,
  memberCandidateIds: members,
  columnX: [10, 60],
  graphicsEvidence: [],
  repeatedHeaderEvidence: [],
  confidence,
  provenance: [],
});

describe("resolveTableRegions", () => {
  it("promotes only complete, high-confidence member sets", () => {
    const resolved = resolveTableRegions([node("a"), node("b")], [region(["a", "b"], 0.99)]);
    expect(resolved.map((item) => item.role)).toEqual(["table", "table"]);
  });

  it("keeps low-confidence and partial regions as paragraphs", () => {
    const nodes = [node("a"), node("b")];
    const resolved = resolveTableRegions(nodes, [region(["a", "missing"], 1), region(["b"], 0.97)]);
    expect(resolved.map((item) => item.role)).toEqual(["paragraph", "paragraph"]);
  });
});
