import { describe, expect, it } from "vitest";
import { demotedRowContinuationRelations, pageBoundaryContinuationRelations } from "../../services/pdfExtraction/resolver/relationResolver";
import type { CanonicalNode } from "../../services/pdfExtraction/canonical/types";

const node = (id: string, page: number, text: string, y: number, column: string): CanonicalNode => ({
  id,
  role: "paragraph",
  text,
  pageStart: page,
  pageEnd: page,
  boundingBoxes: [{ page, x: column === "right" ? 320 : 50, y, width: 240, height: 12 }],
  confidence: 0.9,
  evidence: [],
  sourceAnchor: { page, boundingBoxes: [{ page, x: 50, y, width: 240, height: 12 }] },
  column,
});

const layouts = [
  { page: 1, pageWidth: 600, pageHeight: 800, isMultiColumn: true, gutterX: 300, leftX: 50, rightX: 320 },
  { page: 2, pageWidth: 600, pageHeight: 800, isMultiColumn: true, gutterX: 300, leftX: 50, rightX: 320 },
];

describe("pageBoundaryContinuationRelations", () => {
  it("links a bottom-of-page paragraph to a lowercase top-of-page continuation", () => {
    const relations = pageBoundaryContinuationRelations([
      node("p1", 1, "The experiment examined the relationship between the intervention and outcome across all participants and conditions without a terminal mark", 690, "right"),
      node("p2", 2, "and the results were analyzed using a preregistered model.", 80, "left"),
    ], layouts);
    expect(relations).toEqual([{ kind: "CONTINUES", from: "p1", to: "p2", score: 0.88 }]);
  });

  it("does not link complete or mid-page paragraphs", () => {
    const relations = pageBoundaryContinuationRelations([
      node("p1", 1, "A complete paragraph ends here.", 690, "right"),
      node("p2", 2, "This is a new paragraph.", 80, "left"),
      node("p3", 2, "and this begins in the middle of the page.", 420, "left"),
    ], layouts);
    expect(relations).toEqual([]);
  });
});

describe("demotedRowContinuationRelations", () => {
  it("links a demoted unfinished row to an open paragraph before it and the paragraph after it", () => {
    const row = { ...node("row", 1, "MG: Formal analysis, Methodology, Writing –", 300, "left"), evidence: [{ source: "generic-heuristic" as const, label: "unfinished-heading-demotion", confidence: 0.8 }] };
    expect(demotedRowContinuationRelations([
      node("a", 1, "BS: Conceptualization, Data curation, Writing –", 280, "left"),
      row,
      node("b", 1, "review & editing, Supervision.", 320, "left"),
    ])).toEqual([
      { kind: "CONTINUES", from: "a", to: "row", score: 0.8 },
      { kind: "CONTINUES", from: "row", to: "b", score: 0.8 },
    ]);
  });
});
