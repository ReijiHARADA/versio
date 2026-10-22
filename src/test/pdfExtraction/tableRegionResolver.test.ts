import { describe, expect, it } from "vitest";
import {
  mergeAdjacentTableRows,
  mergeTableRowsByPageGeometry,
  promoteCaptionBoundedTableCells,
  resolveTableRegions,
} from "../../services/pdfExtraction/resolver/documentResolver";
import type { CanonicalNode } from "../../services/pdfExtraction/canonical/types";
import type { StructuralRegionEvidence } from "../../services/pdfExtraction/types";

const node = (id: string, text = "Thumb 0.000 0.151"): CanonicalNode => ({
  id,
  role: "paragraph",
  text,
  pageStart: 1,
  pageEnd: 1,
  boundingBoxes: [{ page: 1, x: 10, y: 10, width: 40, height: 10 }],
  confidence: 0.7,
  evidence: [],
  sourceAnchor: { page: 1, boundingBoxes: [] },
});

const tableRow = (id: string, text: string, y: number): CanonicalNode => ({
  id,
  role: "table",
  text,
  pageStart: 1,
  pageEnd: 1,
  boundingBoxes: [{ page: 1, x: 40, y, width: 280, height: 12 }],
  confidence: 0.96,
  evidence: [{
    source: "generic-heuristic",
    label: "table-row-geometry",
    confidence: 0.96,
    page: 1,
  }],
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

  it("does not promote chart-adjacent prose words into table members", () => {
    const resolved = resolveTableRegions(
      [node("a", "were"), node("b", "perceived"), node("c", "Thumb 0.000 0.151")],
      [region(["a", "b", "c"], 0.99)]
    );
    expect(resolved.map((item) => item.role)).toEqual(["paragraph", "paragraph", "table"]);
  });
});

describe("mergeAdjacentTableRows", () => {
  it("collapses consecutive checkmark comparison rows and demotes panel labels", () => {
    const merged = mergeAdjacentTableRows([
      tableRow("cap", "TABLE 1 Comparison of reviews", 80),
      { ...tableRow("panel", "(a)", 100), evidence: [{ source: "generic-heuristic", label: "repeated-prose-cell-grid", confidence: 0.96, page: 1 }] },
      tableRow("r1", "• Machine learning ✓ ✓", 120),
      tableRow("r2", "• Deep learning ✓ ✓", 136),
      tableRow("r3", "• Jumping ✓ X", 152),
    ]);
    expect(merged.map((item) => item.role)).toEqual(["table", "table"]);
    expect(merged.some((item) => item.text === "(a)")).toBe(false);
    expect(merged[0]?.text).toMatch(/^TABLE 1/);
    expect(merged[1]?.text).toContain("• Machine learning");
    expect(merged[1]?.text).toContain("• Deep learning");
    expect(merged[1]?.text).toContain("• Jumping");
  });

  it("merges same-page table rows by geometry despite intervening prose", () => {
    const prose = (id: string, text: string, y: number): CanonicalNode => ({
      id,
      role: "paragraph",
      text,
      pageStart: 1,
      pageEnd: 1,
      boundingBoxes: [{ page: 1, x: 300, y, width: 120, height: 12 }],
      confidence: 0.7,
      evidence: [],
      sourceAnchor: { page: 1, boundingBoxes: [] },
    });
    const merged = mergeTableRowsByPageGeometry([
      tableRow("r1", "[79] FER2013 Adults Public 7 emotions", 120),
      prose("p1", "A long prose paragraph about affective computing methods that should not block geometry merge.", 130),
      tableRow("r2", "[33] AffectNet Adults Face Public", 150),
      tableRow("r3", "[12] CK+ Adults Face Public 7 emotions", 170),
    ]);
    const tables = merged.filter((item) => item.role === "table");
    expect(tables).toHaveLength(1);
    expect(tables[0]?.text).toContain("FER2013");
    expect(tables[0]?.text).toContain("AffectNet");
    expect(tables[0]?.text).toContain("CK+");
    expect(merged.some((item) => item.role === "paragraph")).toBe(true);
  });

  it("joins table rows across weak two-column intervening crumbs", () => {
    const crumb = (id: string, text: string, y: number): CanonicalNode => ({
      id,
      role: "paragraph",
      text,
      pageStart: 1,
      pageEnd: 1,
      boundingBoxes: [{ page: 1, x: 320, y, width: 80, height: 10 }],
      confidence: 0.6,
      evidence: [],
      sourceAnchor: { page: 1, boundingBoxes: [] },
    });
    const merged = mergeAdjacentTableRows([
      tableRow("r1", "18 Tinku Anthropomorphic", 120),
      crumb("c1", "partial", 128),
      tableRow("r2", "19 Shybo Anthropomorphic", 140),
      crumb("c2", "partial", 148),
      tableRow("r3", "20 Roboldo Anthropomorphic", 160),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.role).toBe("table");
    expect(merged[0]?.text).toContain("18 Tinku");
    expect(merged[0]?.text).toContain("19 Shybo");
    expect(merged[0]?.text).toContain("20 Roboldo");
    expect(merged[0]?.text).toContain("partial");
  });
});

describe("promoteCaptionBoundedTableCells", () => {
  it("promotes short cell crumbs between numbered table captions", () => {
    const caption = (id: string, text: string, y: number): CanonicalNode => ({
      id,
      role: "caption",
      text,
      pageStart: 1,
      pageEnd: 1,
      boundingBoxes: [{ page: 1, x: 40, y, width: 200, height: 12 }],
      confidence: 0.9,
      evidence: [],
      sourceAnchor: { page: 1, boundingBoxes: [] },
    });
    const cell = (id: string, text: string, y: number, role: CanonicalNode["role"] = "paragraph"): CanonicalNode => ({
      id,
      role,
      text,
      pageStart: 1,
      pageEnd: 1,
      boundingBoxes: [{ page: 1, x: 40, y, width: 120, height: 11 }],
      confidence: 0.7,
      evidence: [],
      sourceAnchor: { page: 1, boundingBoxes: [] },
    });
    const promoted = promoteCaptionBoundedTableCells([
      caption("c6", "TABLE 6 F-squared.", 100),
      cell("a", "AI adoption", 120),
      cell("b", "0.944 (large)", 135, "heading"),
      cell("c", "—", 150),
      cell("d", "Source: author’s calculation.", 165),
      caption("c7", "TABLE 7 R-squared.", 200),
      cell("e", "Employee wellbeing", 220),
      cell("f", "0.542 0.536", 235),
      cell("g", "Technostress", 250),
      {
        ...cell("body", "However, the interaction effect between POS and Technostress was not significant.", 280),
        role: "paragraph",
      },
    ]);
    expect(promoted.filter((n) => n.role === "table").map((n) => n.id)).toEqual([
      "a", "b", "c", "d", "e", "f", "g",
    ]);
    expect(promoted.find((n) => n.id === "body")?.role).toBe("paragraph");
    expect(promoted.find((n) => n.id === "b")?.evidence.some((e) => e.label === "caption-bounded-table-cell")).toBe(true);
  });
});
