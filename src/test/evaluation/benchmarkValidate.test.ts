import { describe, expect, it } from "vitest";
import { validateBenchmarkGold, validateBenchmarkPrediction } from "../../evaluation/benchmark/validate";
import type { ExtractionBenchmarkGold, ExtractionBenchmarkPrediction } from "../../evaluation/benchmark/schema";

const base: ExtractionBenchmarkGold = { schemaVersion: 1, kind: "versio-extraction-benchmark-gold", id: "g", source: { fileHash: "hash" }, split: "heldout", leakageGroup: "unique", attributes: {}, annotatedPages: [1], coverage: { text: "none", blocks: "complete", readingOrder: "none", paragraphBoundaries: "none", captionRelations: "none", tables: "none", formulas: "none" }, blocks: [{ id: "b", role: "paragraph", region: { page: 1, x: 0, y: 0, width: 1, height: 1 } }] };

describe("benchmark gold validation", () => {
  it("accepts an explicitly scoped block-only annotation", () => expect(validateBenchmarkGold(base)).toEqual([]));
  it("rejects complete dimensions without their gold targets", () => {
    const issues = validateBenchmarkGold({ ...base, coverage: { ...base.coverage, formulas: "complete", readingOrder: "complete" } }).join(" ");
    expect(issues).toMatch(/formula.*LaTeX/i); expect(issues).toMatch(/reading-order/i);
  });
  it("rejects malformed prediction order and geometry before scoring", () => {
    const prediction: ExtractionBenchmarkPrediction = { schemaVersion: 1, kind: "versio-extraction-benchmark-prediction", id: "p", parser: { id: "parser", version: "1" }, source: { fileHash: "hash" }, blocks: [{ id: "b", role: "paragraph", region: { page: 1, x: 0, y: 0, width: 0, height: 1 } }], readingOrder: ["missing"] };
    expect(validateBenchmarkPrediction(prediction).join(" ")).toMatch(/valid regions.*unique known/i);
  });
});
