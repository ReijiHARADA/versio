import { describe, expect, it } from "vitest";
import { assertNoLeakage, evaluateBenchmarkDocument } from "../../evaluation/benchmark/evaluate";
import type { ExtractionBenchmarkGold, ExtractionBenchmarkPrediction } from "../../evaluation/benchmark/schema";
import { predictionFromSnapshot } from "../../evaluation/benchmark/adapters";
import type { ExtractionSnapshot } from "../../evaluation/schema";

const gold: ExtractionBenchmarkGold = { schemaVersion: 1, kind: "paper-reader-extraction-benchmark-gold", id: "heldout-one", source: { fileHash: "hash" }, split: "heldout", leakageGroup: "publisher-template-x", attributes: {}, annotatedPages: [1], coverage: { text: "complete", blocks: "complete", readingOrder: "complete", paragraphBoundaries: "complete", captionRelations: "none", tables: "none", formulas: "complete" }, blocks: [{ id: "g1", role: "paragraph", region: { page: 1, x: 0, y: 0, width: 20, height: 10 }, text: "alpha" }, { id: "g2", role: "equation", region: { page: 1, x: 0, y: 20, width: 20, height: 10 }, text: "x=1" }], readingOrder: ["g1", "g2"], paragraphBoundaries: [["g1", "g2"]], formulas: [{ id: "g2", region: { page: 1, x: 0, y: 20, width: 20, height: 10 }, latex: "x=1" }] };
const prediction: ExtractionBenchmarkPrediction = { schemaVersion: 1, kind: "paper-reader-extraction-benchmark-prediction", id: "heldout-one", parser: { id: "test", version: "1" }, source: { fileHash: "hash" }, blocks: [{ id: "p1", role: "paragraph", region: { page: 1, x: 0, y: 0, width: 20, height: 10 }, text: "alpha" }, { id: "p2", role: "equation", region: { page: 1, x: 0, y: 20, width: 20, height: 10 }, text: "x=1" }], readingOrder: ["p1", "p2"], paragraphBoundaries: [["p1", "p2"]], formulas: [{ id: "different-parser-id", region: { page: 1, x: 0, y: 20, width: 20, height: 10 }, latex: "x=1" }] };

describe("benchmark evaluation", () => {
  it("separates complete dimensions from CDM that has not been externally calculated", () => {
    const report = evaluateBenchmarkDocument(gold, prediction);
    expect(report.blockF1?.value).toBe(1); expect(report.textCer?.value).toBe(0);
    expect(report.formulaNed?.value).toBe(0); expect(report.formulaCdm?.value).toBeNull();
  });
  it("reports an externally supplied CDM score without substituting formula NED", () => {
    const report = evaluateBenchmarkDocument(gold, { ...prediction, formulas: prediction.formulas?.map((formula) => ({ ...formula, cdm: 93.2 })) });
    expect(report.formulaNed?.value).toBe(0); expect(report.formulaCdm?.value).toBe(93.2);
  });
  it("scores Paper Reader linear formula text without pretending it is LaTeX", () => {
    const textGold = { ...gold, formulas: [{ ...gold.formulas![0]!, text: "x = 1", latex: undefined }] };
    const textPrediction = { ...prediction, formulas: [{ ...prediction.formulas![0]!, text: "x = 1", latex: undefined }] };
    const report = evaluateBenchmarkDocument(textGold, textPrediction);
    expect(report.formulaNed).toMatchObject({ value: 0, evaluated: 5 });
    expect(report.formulaCdm?.value).toBeNull();
  });
  it("counts a human-added missing formula as a Formula NED miss", () => {
    const missingGold = {
      ...gold,
      blocks: [{ id: "missing:eq", role: "equation" as const, region: { page: 1, x: 40, y: 20, width: 20, height: 10 }, text: "y = 2" }],
      readingOrder: undefined,
      paragraphBoundaries: undefined,
      coverage: { ...gold.coverage, text: "none" as const, readingOrder: "none" as const, paragraphBoundaries: "none" as const },
      formulas: [{ id: "missing:eq", region: { page: 1, x: 40, y: 20, width: 20, height: 10 }, text: "y = 2" }],
    };
    const missingPrediction = { ...prediction, blocks: [], readingOrder: undefined, paragraphBoundaries: undefined, formulas: [] };
    const report = evaluateBenchmarkDocument(missingGold, missingPrediction);
    expect(report.formulaNed).toMatchObject({ value: 1, evaluated: 5 });
    expect(report.blockF1).toMatchObject({ value: 0 });
  });
  it("counts a missing LaTeX-only formula as Formula NED 1 instead of N/A", () => {
    const report = evaluateBenchmarkDocument(gold, { ...prediction, blocks: [prediction.blocks[0]!], readingOrder: ["p1"], paragraphBoundaries: [], formulas: [] });
    expect(report.formulaNed).toMatchObject({ value: 1, evaluated: 3 });
  });
  it("maximizes formula matches when overlapping regions have alternatives", () => {
    const formulas = [
      { id: "f1", region: { page: 1, x: 0, y: 0, width: 10, height: 10 }, text: "first" },
      { id: "f2", region: { page: 1, x: 3, y: 0, width: 10, height: 10 }, text: "second" },
    ];
    const formulaGold = {
      ...gold,
      coverage: { text: "none" as const, blocks: "complete" as const, readingOrder: "none" as const, paragraphBoundaries: "none" as const, captionRelations: "none" as const, tables: "none" as const, formulas: "complete" as const },
      blocks: formulas.map((formula) => ({ id: formula.id, role: "equation" as const, region: formula.region })),
      readingOrder: undefined,
      paragraphBoundaries: undefined,
      formulas,
    };
    const formulaPrediction = { ...prediction, formulas: [
      { id: "p-flexible", region: { page: 1, x: 0, y: 0, width: 10, height: 10 }, text: "second" },
      { id: "p-f1-only", region: { page: 1, x: 0, y: 0, width: 5, height: 10 }, text: "first" },
    ] };
    expect(evaluateBenchmarkDocument(formulaGold, formulaPrediction).formulaNed).toMatchObject({ value: 0, evaluated: 11 });
  });
  it("rejects publisher/template leakage across data splits", () => {
    expect(() => assertNoLeakage([gold, { ...gold, id: "dev-one", split: "development" }])).toThrow(/Leakage group/);
  });
  it("rejects duplicate publisher/template groups within one split", () => {
    expect(() => assertNoLeakage([gold, { ...gold, id: "heldout-sibling", source: { fileHash: "other-hash" } }])).toThrow(/Leakage group/);
  });
  it("rejects a source PDF reused under another benchmark document", () => {
    expect(() => assertNoLeakage([gold, { ...gold, id: "validation-copy", split: "validation", leakageGroup: "independent-template" }])).toThrow(/Source hash/);
  });
  it("rejects duplicate benchmark document IDs", () => {
    expect(() => assertNoLeakage([gold, { ...gold, source: { fileHash: "different-hash" } }])).toThrow(/document ID/);
  });
  it("does not label a page without order pairs or boundaries as perfect", () => {
    const sparse = { ...gold, coverage: { ...gold.coverage, readingOrder: "none" as const, paragraphBoundaries: "none" as const }, readingOrder: undefined, paragraphBoundaries: undefined };
    const report = evaluateBenchmarkDocument(sparse, { ...prediction, readingOrder: ["p1"], paragraphBoundaries: [] });
    expect(report.readingOrder?.value).toBeNull();
    expect(report.paragraphBoundaries?.value).toBeNull();
  });
  it("does not score a prediction that omits blocks from its claimed reading order", () => {
    const report = evaluateBenchmarkDocument(gold, { ...prediction, readingOrder: ["p1"] });
    expect(report.readingOrder).toMatchObject({ value: null, evaluated: 0 });
  });
  it("uses the relative order of annotated pages from a full-document prediction", () => {
    const extra = { id: "p-other", role: "paragraph" as const, region: { page: 2, x: 0, y: 0, width: 20, height: 10 }, text: "unannotated" };
    const report = evaluateBenchmarkDocument(gold, { ...prediction, blocks: [...prediction.blocks, extra], readingOrder: ["p1", "p-other", "p2"] });
    expect(report.readingOrder).toMatchObject({ value: 0, evaluated: 2 });
  });
  it("keeps text measurable when geometry matches but the predicted role is wrong", () => {
    const report = evaluateBenchmarkDocument(gold, { ...prediction, blocks: prediction.blocks.map((block) => block.id === "p1" ? { ...block, role: "heading" } : block) });
    expect(report.blockF1?.value).toBeLessThan(1);
    expect(report.textCer).toMatchObject({ value: 0, evaluated: 8 });
  });
  it("scores explicitly annotated caption-to-figure relations independently", () => {
    const blocks = [{ id: "caption", role: "caption" as const, region: { page: 1, x: 0, y: 0, width: 20, height: 10 }, text: "Figure 1" }, { id: "figure", role: "figure" as const, region: { page: 1, x: 0, y: 20, width: 20, height: 10 }, text: "" }];
    const relationGold = { ...gold, coverage: { text: "none" as const, blocks: "complete" as const, readingOrder: "none" as const, paragraphBoundaries: "none" as const, captionRelations: "complete" as const, tables: "none" as const, formulas: "none" as const }, blocks, readingOrder: undefined, paragraphBoundaries: undefined, formulas: undefined, captionRelations: [["caption", "figure"]] as Array<[string, string]> };
    const relationPrediction = { ...prediction, blocks: blocks.map((block) => ({ ...block, id: `p-${block.id}` })), readingOrder: undefined, paragraphBoundaries: undefined, formulas: undefined, captionRelations: [["p-caption", "p-figure"]] as Array<[string, string]> };
    expect(evaluateBenchmarkDocument(relationGold, relationPrediction).captionRelations).toMatchObject({ value: 1, evaluated: 2 });
  });
  it("surfaces zero-score reviewed structure dimensions as critical failures", () => {
    const structureGold = {
      ...gold,
      coverage: { text: "none" as const, blocks: "complete" as const, readingOrder: "none" as const, paragraphBoundaries: "complete" as const, captionRelations: "complete" as const, tables: "complete" as const, formulas: "none" as const },
      readingOrder: undefined, formulas: undefined,
      blocks: [{ id: "paragraph-a", role: "paragraph" as const, region: { page: 1, x: 0, y: 0, width: 20, height: 10 } }, { id: "paragraph-b", role: "paragraph" as const, region: { page: 1, x: 0, y: 20, width: 20, height: 10 } }, { id: "caption", role: "caption" as const, region: { page: 1, x: 30, y: 0, width: 20, height: 10 } }, { id: "figure", role: "figure" as const, region: { page: 1, x: 30, y: 20, width: 20, height: 10 } }, { id: "table", role: "table" as const, region: { page: 1, x: 60, y: 0, width: 20, height: 20 } }],
      paragraphBoundaries: [["paragraph-a", "paragraph-b"]] as Array<[string, string]>, captionRelations: [["caption", "figure"]] as Array<[string, string]>,
      tables: [{ id: "table", region: { page: 1, x: 60, y: 0, width: 20, height: 20 }, tree: { tag: "table", children: [{ tag: "tr" }] } }],
    };
    const structurePrediction = { ...prediction, blocks: structureGold.blocks.map((block) => ({ ...block, id: `p-${block.id}` })), readingOrder: undefined, paragraphBoundaries: [], captionRelations: [], tables: [] };
    const report = evaluateBenchmarkDocument(structureGold, structurePrediction);
    expect(report.criticalFailures).toEqual(expect.arrayContaining([
      "No annotated paragraph boundaries matched.", "No annotated caption relations matched.", "No annotated table structure matched.",
    ]));
  });
  it("adapts a Studio snapshot without turning it into gold", () => {
    const snapshot = { schemaVersion: 1, kind: "paper-reader-extraction-snapshot", createdAt: "now", parser: { id: "paper-reader", version: "test" }, source: { paperId: "source", fileName: "source.pdf", fileHash: "hash", pageCount: 1 }, pages: [], projection: { blocks: [] }, canonical: { source: { fileHash: "hash", pageCount: 1 }, pageCount: 1, format: { applied: "generic", scores: { generic: 1, acm: 0, ieee: 0 }, reason: "test" }, pageKind: "native", formatId: "generic", diagnostics: { layoutConfidence: 1, readingOrderConfidence: 1, textIntegrityConfidence: 1, semanticConfidence: 1, formatConfidence: 1, relationConfidence: 1, columnConfidence: 1, unicodeConfidence: 1, paragraphConfidence: 1 }, relations: [], nodes: [{ id: "node", role: "header", text: "header", pageStart: 1, pageEnd: 1, boundingBoxes: [{ page: 1, x: 1, y: 2, width: 3, height: 4 }], confidence: 1, evidence: [], sourceAnchor: { page: 1, boundingBoxes: [] } }] } } as ExtractionSnapshot;
    const prediction = predictionFromSnapshot(snapshot);
    expect(prediction.blocks[0]).toMatchObject({ id: "node@1", role: "other", region: { page: 1, x: 1, y: 2, width: 3, height: 4 } });
  });
  it("exports canonical equations as formula text, never fabricated LaTeX", () => {
    const snapshot = { schemaVersion: 1, kind: "paper-reader-extraction-snapshot", createdAt: "now", parser: { id: "paper-reader", version: "test" }, source: { paperId: "source", fileName: "source.pdf", fileHash: "hash", pageCount: 1 }, pages: [], projection: { blocks: [] }, canonical: { source: { fileHash: "hash", pageCount: 1 }, pageCount: 1, format: { applied: "generic", scores: { generic: 1, acm: 0, ieee: 0 }, reason: "test" }, pageKind: "native", formatId: "generic", diagnostics: { layoutConfidence: 1, readingOrderConfidence: 1, textIntegrityConfidence: 1, semanticConfidence: 1, formatConfidence: 1, relationConfidence: 1, columnConfidence: 1, unicodeConfidence: 1, paragraphConfidence: 1 }, relations: [], nodes: [{ id: "eq", role: "equation", text: "x = 1", pageStart: 1, pageEnd: 1, boundingBoxes: [{ page: 1, x: 1, y: 2, width: 3, height: 4 }], confidence: 1, evidence: [], sourceAnchor: { page: 1, boundingBoxes: [] } }] } } as ExtractionSnapshot;
    expect(predictionFromSnapshot(snapshot).formulas).toEqual([{ id: "eq@1", region: { page: 1, x: 1, y: 2, width: 3, height: 4 }, text: "x = 1" }]);
  });
  it("adapts same-page Canonical CAPTION_OF relations without parser IDs leaking into gold", () => {
    const snapshot = { schemaVersion: 1, kind: "paper-reader-extraction-snapshot", createdAt: "now", parser: { id: "paper-reader", version: "test" }, source: { paperId: "source", fileName: "source.pdf", fileHash: "hash", pageCount: 1 }, pages: [], projection: { blocks: [] }, canonical: { source: { fileHash: "hash", pageCount: 1 }, pageCount: 1, format: { applied: "generic", scores: { generic: 1, acm: 0, ieee: 0 }, reason: "test" }, pageKind: "native", formatId: "generic", diagnostics: { layoutConfidence: 1, readingOrderConfidence: 1, textIntegrityConfidence: 1, semanticConfidence: 1, formatConfidence: 1, relationConfidence: 1, columnConfidence: 1, unicodeConfidence: 1, paragraphConfidence: 1 }, relations: [{ kind: "CAPTION_OF", from: "caption", to: "figure", score: 1 }], nodes: [{ id: "caption", role: "caption", text: "Figure 1", pageStart: 1, pageEnd: 1, boundingBoxes: [{ page: 1, x: 1, y: 2, width: 3, height: 4 }], confidence: 1, evidence: [], sourceAnchor: { page: 1, boundingBoxes: [] } }, { id: "figure", role: "figure", text: null, pageStart: 1, pageEnd: 1, boundingBoxes: [{ page: 1, x: 1, y: 8, width: 3, height: 4 }], confidence: 1, evidence: [], sourceAnchor: { page: 1, boundingBoxes: [] } }] } } as ExtractionSnapshot;
    expect(predictionFromSnapshot(snapshot).captionRelations).toEqual([["caption@1", "figure@1"]]);
  });
});
