import { describe, expect, it } from "vitest";
import { evaluateReview } from "../../evaluation/metrics";
import { newReview, type ExtractionSnapshot } from "../../evaluation/schema";

function snapshot(): ExtractionSnapshot {
  return {
    schemaVersion: 1, kind: "versio-extraction-snapshot", createdAt: "2026-01-01T00:00:00.000Z",
    parser: { id: "test", version: "1" }, source: { paperId: "p", fileName: "p.pdf", fileHash: "hash", pageCount: 1 },
    pages: [{ page: 1, width: 100, height: 100 }],
    canonical: { source: { fileHash: "hash", pageCount: 1 }, pageCount: 1, format: { applied: "generic", scores: { generic: 1, acm: 0, ieee: 0 }, reason: "test" }, pageKind: "native", formatId: "generic", diagnostics: { layoutConfidence: 1, readingOrderConfidence: 1, textIntegrityConfidence: 1, semanticConfidence: 1, formatConfidence: 1, relationConfidence: 1, columnConfidence: 1, unicodeConfidence: 1, paragraphConfidence: 1 }, relations: [], nodes: [{ id: "n1", role: "paragraph", text: "hello", pageStart: 1, pageEnd: 1, boundingBoxes: [{ page: 1, x: 1, y: 1, width: 10, height: 10 }], confidence: 1, evidence: [], sourceAnchor: { page: 1, boundingBoxes: [] } }] },
    projection: { blocks: [] },
  };
}

describe("evaluation metrics", () => {
  it("reports N/A rather than 100% for an incomplete page", () => {
    const value = snapshot(); const review = newReview(value);
    expect(evaluateReview(value, review).roles.paragraph).toMatchObject({ precision: null, recall: null, f1: null });
  });
  it("scores a fully reviewed matching structure", () => {
    const value = snapshot(); const review = newReview(value); const page = review.pages[0];
    page.status = "complete"; page.coverage.predictedComplete = true; page.coverage.goldComplete = true;
    page.blockReviews.push({ id: "r", page: 1, predictedNodeId: "n1", correctRole: "paragraph", verdict: "correct", errorTypes: [], severity: "minor", createdAt: "now", updatedAt: "now" });
    expect(evaluateReview(value, review).roles.paragraph).toMatchObject({ precision: 1, recall: 1, f1: 1 });
  });
  it("counts a role correction as a false negative for the gold role", () => {
    const value = snapshot(); value.canonical.nodes[0].role = "heading";
    const review = newReview(value); const page = review.pages[0];
    page.status = "complete"; page.coverage.predictedComplete = true; page.coverage.goldComplete = true;
    page.blockReviews.push({ id: "r", page: 1, predictedNodeId: "n1", correctRole: "paragraph", verdict: "incorrect", errorTypes: ["role"], severity: "major", createdAt: "now", updatedAt: "now" });
    expect(evaluateReview(value, review).roles.paragraph.recall).toBe(0);
  });
});
