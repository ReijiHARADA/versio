import { describe, expect, it } from "vitest";
import type { PaperBlock } from "../../types/paper";
import type { CanonicalDocument } from "../../services/pdfExtraction/canonical/types";
import { namespaceReextractedPage } from "../../evaluation/reextractSnapshot";

const box = { page: 14, x: 10, y: 20, width: 100, height: 12 };

function document(): CanonicalDocument {
  return {
    source: { fileHash: "fixture", pageCount: 1 }, pageCount: 1,
    format: { family: "generic", confidence: 0, reasons: [] },
    pageKind: "native", formatId: "generic",
    diagnostics: { layoutConfidence: 1, readingOrderConfidence: 1, textIntegrityConfidence: 1, semanticConfidence: 1, formatConfidence: 1, relationConfidence: 1, columnConfidence: 1, unicodeConfidence: 1, paragraphConfidence: 1 },
    nodes: [
      { id: "g-0", role: "equation", text: "x²", pageStart: 14, pageEnd: 14, boundingBoxes: [box], overlayBoundingBoxes: [box], confidence: 1, evidence: [], sourceAnchor: { page: 14, boundingBoxes: [box] } },
      { id: "g-1", role: "paragraph", text: "explanation", pageStart: 14, pageEnd: 14, boundingBoxes: [box], confidence: 1, evidence: [], sourceAnchor: { page: 14, boundingBoxes: [box] } },
    ],
    relations: [{ kind: "READS_BEFORE", from: "g-0", to: "g-1", score: 1 }],
  };
}

function block(): PaperBlock {
  return { id: "block", paperId: "fixture", sectionId: null, type: "equation", order: 0, pageStart: 14, pageEnd: 14, boundingBoxes: [box], original: "x²", translated: null, extractionConfidence: 1, translationStatus: "pending", parentBlockId: null, metadata: { canonicalNodeId: "g-0" } };
}

describe("namespaceReextractedPage", () => {
  it("avoids generic-ID collisions while retaining relations and projection links", () => {
    const original = document();
    const replacement = namespaceReextractedPage(original, [block()], 14);

    expect(replacement.canonical.nodes.map((node) => node.id)).toEqual(["eval-reextract-p14--g-0", "eval-reextract-p14--g-1"]);
    expect(replacement.canonical.relations).toEqual([{ kind: "READS_BEFORE", from: "eval-reextract-p14--g-0", to: "eval-reextract-p14--g-1", score: 1 }]);
    expect(replacement.blocks[0]?.metadata.canonicalNodeId).toBe("eval-reextract-p14--g-0");
    expect(replacement.canonical.nodes[0]?.overlayBoundingBoxes).toEqual([box]);
    expect(original.nodes[0]?.id).toBe("g-0");
  });
});
