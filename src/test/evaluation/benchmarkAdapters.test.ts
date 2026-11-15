import { describe, expect, it } from "vitest";
import { predictionFromSnapshot } from "../../evaluation/benchmark/adapters";
import type { ExtractionSnapshot } from "../../evaluation/schema";

function snapshot(): ExtractionSnapshot {
  const node = (id: string, role: "paragraph" | "heading" | "table", page: number, y: number) => ({
    id, role, text: id, pageStart: page, pageEnd: page,
    boundingBoxes: [{ page, x: 10, y, width: 40, height: 10 }], confidence: 1,
    evidence: [], sourceAnchor: { page, boundingBoxes: [{ page, x: 10, y, width: 40, height: 10 }] },
  });
  return {
    schemaVersion: 1, kind: "versio-extraction-snapshot", createdAt: "now",
    parser: { id: "test", version: "1" }, source: { paperId: "p", fileHash: "hash", pageCount: 2 }, pages: [], projection: { blocks: [] },
    canonical: {
      source: { fileHash: "hash", pageCount: 2 }, pageCount: 2, formatId: "generic", pageKind: "native",
      format: { applied: "generic", scores: { generic: 1, acm: 0, ieee: 0 }, reason: "test" },
      diagnostics: { layoutConfidence: 1, readingOrderConfidence: 1, textIntegrityConfidence: 1, semanticConfidence: 1, formatConfidence: 1, relationConfidence: 1, columnConfidence: 1, unicodeConfidence: 1, paragraphConfidence: 1 },
      relations: [], nodes: [node("p1", "paragraph", 1, 10), node("heading", "heading", 1, 25), node("p2", "paragraph", 1, 40), node("p3", "paragraph", 2, 10)],
    },
  };
}

describe("predictionFromSnapshot", () => {
  it("exports Canonical paragraph split pairs without crossing pages", () => {
    const prediction = predictionFromSnapshot(snapshot());
    expect(prediction.paragraphBoundaries).toEqual([["p1@1", "p2@1"]]);
  });

  it("exports Reader-native table rows as a neutral TEDS tree", () => {
    const value = snapshot();
    value.canonical.nodes.push({ ...value.canonical.nodes[0], id: "table", role: "table", text: "A B", boundingBoxes: [{ page: 1, x: 10, y: 60, width: 40, height: 20 }] });
    value.projection.blocks.push({
      id: "reader-table", paperId: "p", sectionId: null, type: "table", order: 1, pageStart: 1, pageEnd: 1,
      boundingBoxes: [{ page: 1, x: 10, y: 60, width: 40, height: 20 }], original: "A B 1 2", translated: null,
      extractionConfidence: 1, translationStatus: "skipped", parentBlockId: null,
      metadata: { canonicalNodeId: "table", tableRows: [[{ text: "A", x: 10, width: 10 }, { text: "B", x: 25, width: 10 }], [{ text: "1", x: 10, width: 10 }, { text: "2", x: 25, width: 10 }]] },
    });
    const prediction = predictionFromSnapshot(value);
    expect(prediction.tables).toEqual([{ id: "table@1", region: { page: 1, x: 10, y: 60, width: 40, height: 20 }, tree: { tag: "table", children: [{ tag: "tr", children: [{ tag: "td", text: "A" }, { tag: "td", text: "B" }] }, { tag: "tr", children: [{ tag: "td", text: "1" }, { tag: "td", text: "2" }] }] } }]);
  });
});
