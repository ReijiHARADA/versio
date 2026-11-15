import { describe, expect, it } from "vitest";
import { goldFromCompletedReview } from "../../evaluation/benchmark/reviewGold";
import { newReview, type ExtractionSnapshot } from "../../evaluation/schema";

function snapshot(): ExtractionSnapshot {
  return { schemaVersion: 1, kind: "paper-reader-extraction-snapshot", createdAt: "now", parser: { id: "test", version: "1" }, source: { paperId: "p", fileName: "p.pdf", fileHash: "hash", pageCount: 1 }, pages: [], projection: { blocks: [] }, canonical: { source: { fileHash: "hash", pageCount: 1 }, pageCount: 1, format: { applied: "generic", scores: { generic: 1, acm: 0, ieee: 0 }, reason: "test" }, pageKind: "native", formatId: "generic", diagnostics: { layoutConfidence: 1, readingOrderConfidence: 1, textIntegrityConfidence: 1, semanticConfidence: 1, formatConfidence: 1, relationConfidence: 1, columnConfidence: 1, unicodeConfidence: 1, paragraphConfidence: 1 }, relations: [], nodes: [{ id: "n", role: "paragraph", text: "reviewed text", pageStart: 1, pageEnd: 1, boundingBoxes: [{ page: 1, x: 1, y: 2, width: 3, height: 4 }], confidence: 1, evidence: [], sourceAnchor: { page: 1, boundingBoxes: [] } }] } };
}

describe("review to benchmark gold", () => {
  it("requires human complete coverage before reusing a reviewed block as gold", () => {
    const value = snapshot(); const review = newReview(value); const page = review.pages[0];
    page.status = "complete"; page.coverage.predictedComplete = true; page.coverage.goldComplete = true;
    const gold = goldFromCompletedReview({ schemaVersion: 1, kind: "paper-reader-extraction-evaluation", snapshot: value, review }, { id: "heldout", split: "heldout", leakageGroup: "unique", attributes: {} });
    expect(gold).toMatchObject({ annotatedPages: [1], coverage: { blocks: "complete", text: "none", readingOrder: "none" } });
    expect(gold.blocks).toMatchObject([{ id: "n@1", role: "paragraph" }]);
    expect(gold.blocks?.[0]?.text).toBeUndefined();
    expect(gold.coverage).toMatchObject({ tables: "none", formulas: "none" });
  });
  it("uses text as gold only when a reviewer explicitly writes it", () => {
    const value = snapshot(); const review = newReview(value); const page = review.pages[0];
    page.status = "complete"; page.coverage.predictedComplete = true; page.coverage.goldComplete = true; page.coverage.textComplete = true;
    page.blockReviews = [{ id: "review", page: 1, predictedNodeId: "n", verdict: "correct", errorTypes: [], severity: "critical", goldText: "independently reviewed", createdAt: "now", updatedAt: "now" }];
    const gold = goldFromCompletedReview({ schemaVersion: 1, kind: "paper-reader-extraction-evaluation", snapshot: value, review }, { id: "heldout", split: "heldout", leakageGroup: "unique", attributes: {} });
    expect(gold.coverage.text).toBe("complete");
    expect(gold.blocks?.[0]?.text).toBe("independently reviewed");
  });
  it("does not turn incomplete review into gold", () => {
    const value = snapshot(); const review = newReview(value);
    expect(() => goldFromCompletedReview({ schemaVersion: 1, kind: "paper-reader-extraction-evaluation", snapshot: value, review }, { id: "heldout", split: "heldout", leakageGroup: "unique", attributes: {} })).toThrow(/No page/);
  });
  it("uses an explicitly authored complete reading order, not canonical order by default", () => {
    const value = snapshot(); value.canonical.nodes.push({ ...value.canonical.nodes[0], id: "n2", text: "second", boundingBoxes: [{ page: 1, x: 1, y: 10, width: 3, height: 4 }] });
    const review = newReview(value); const page = review.pages[0]; page.status = "complete"; page.coverage.predictedComplete = true; page.coverage.goldComplete = true; page.coverage.readingOrderComplete = true; page.goldReadingOrder = ["n2", "n"];
    const gold = goldFromCompletedReview({ schemaVersion: 1, kind: "paper-reader-extraction-evaluation", snapshot: value, review }, { id: "heldout", split: "heldout", leakageGroup: "unique", attributes: {} });
    expect(gold.coverage.readingOrder).toBe("complete");
    expect(gold.readingOrder).toEqual(["n2@1", "n@1"]);
  });
  it("keeps the reviewed page ID for a block spanning multiple pages", () => {
    const value = snapshot(); value.source.pageCount = 2; value.canonical.pageCount = 2;
    value.canonical.nodes[0] = { ...value.canonical.nodes[0], pageEnd: 2, boundingBoxes: [{ page: 1, x: 1, y: 2, width: 3, height: 4 }, { page: 2, x: 1, y: 2, width: 3, height: 4 }] };
    const review = newReview(value);
    for (const page of review.pages) { page.status = "complete"; page.coverage.predictedComplete = true; page.coverage.goldComplete = true; page.coverage.readingOrderComplete = true; page.goldReadingOrder = ["n"]; }
    const gold = goldFromCompletedReview({ schemaVersion: 1, kind: "paper-reader-extraction-evaluation", snapshot: value, review }, { id: "heldout", split: "heldout", leakageGroup: "unique", attributes: {} });
    expect(gold.readingOrder).toEqual(["n@1", "n@2"]);
  });
  it("includes formula and table targets only after their explicit complete annotations", () => {
    const value = snapshot(); value.canonical.nodes[0].role = "equation"; value.canonical.nodes[0].text = "x = 1";
    value.canonical.nodes.push({ ...value.canonical.nodes[0], id: "table", role: "table", text: "A B", boundingBoxes: [{ page: 1, x: 1, y: 12, width: 8, height: 4 }] });
    const review = newReview(value); const page = review.pages[0]; page.status = "complete"; page.coverage.predictedComplete = true; page.coverage.goldComplete = true; page.coverage.formulasComplete = true; page.coverage.tablesComplete = true; page.goldFormulas = [{ nodeId: "n", text: "x = 1", latex: "x=1" }]; page.goldTables = [{ nodeId: "table", tree: { tag: "table", children: [{ tag: "tr" }] } }];
    const gold = goldFromCompletedReview({ schemaVersion: 1, kind: "paper-reader-extraction-evaluation", snapshot: value, review }, { id: "heldout", split: "heldout", leakageGroup: "unique", attributes: {} });
    expect(gold.coverage).toMatchObject({ formulas: "complete", tables: "complete" });
    expect(gold.formulas?.[0]).toMatchObject({ text: "x = 1", latex: "x=1" }); expect(gold.tables?.[0]?.tree.tag).toBe("table");
  });
  it("includes a human-added missing equation in complete formula gold", () => {
    const value = snapshot(); value.canonical.nodes[0].role = "equation"; value.canonical.nodes[0].text = "x = 1";
    const review = newReview(value); const page = review.pages[0]; page.status = "complete"; page.coverage.predictedComplete = true; page.coverage.goldComplete = true; page.coverage.formulasComplete = true;
    page.missingRegions = [{ id: "miss-eq", page: 1, region: { page: 1, x: 10, y: 20, width: 30, height: 10 }, correctRole: "equation", textAnchor: { text: "y = 2" }, createdAt: "now" }];
    page.goldFormulas = [{ nodeId: "n", text: "x = 1" }, { missingRegionId: "miss-eq", text: "y = 2" }];
    const gold = goldFromCompletedReview({ schemaVersion: 1, kind: "paper-reader-extraction-evaluation", snapshot: value, review }, { id: "heldout", split: "heldout", leakageGroup: "unique", attributes: {} });
    expect(gold.coverage.formulas).toBe("complete");
    expect(gold.formulas).toEqual(expect.arrayContaining([expect.objectContaining({ id: "n@1", text: "x = 1" }), expect.objectContaining({ id: "missing:miss-eq", text: "y = 2" })]));
  });
  it("uses only an explicit paragraph-boundary pair for boundary gold", () => {
    const value = snapshot(); value.canonical.nodes.push({ ...value.canonical.nodes[0], id: "n2", text: "second", boundingBoxes: [{ page: 1, x: 1, y: 10, width: 3, height: 4 }] });
    const review = newReview(value); const page = review.pages[0]; page.status = "complete"; page.coverage.predictedComplete = true; page.coverage.goldComplete = true; page.coverage.paragraphBoundariesComplete = true; page.goldParagraphBoundaries = [["n", "n2"]];
    const gold = goldFromCompletedReview({ schemaVersion: 1, kind: "paper-reader-extraction-evaluation", snapshot: value, review }, { id: "heldout", split: "heldout", leakageGroup: "unique", attributes: {} });
    expect(gold.coverage.paragraphBoundaries).toBe("complete");
    expect(gold.paragraphBoundaries).toEqual([["n@1", "n2@1"]]);
  });
  it("exports only explicitly authored caption relations", () => {
    const value = snapshot(); value.canonical.nodes[0].role = "caption";
    value.canonical.nodes.push({ ...value.canonical.nodes[0], id: "figure", role: "figure", text: null, boundingBoxes: [{ page: 1, x: 1, y: 10, width: 3, height: 4 }] });
    const review = newReview(value); const page = review.pages[0]; page.status = "complete"; page.coverage.predictedComplete = true; page.coverage.goldComplete = true; page.coverage.relationsComplete = true; page.goldCaptionRelations = [["n", "figure"]];
    const gold = goldFromCompletedReview({ schemaVersion: 1, kind: "paper-reader-extraction-evaluation", snapshot: value, review }, { id: "heldout", split: "heldout", leakageGroup: "unique", attributes: {} });
    expect(gold.coverage.captionRelations).toBe("complete");
    expect(gold.captionRelations).toEqual([["n@1", "figure@1"]]);
  });
});
