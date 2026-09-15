import { describe, expect, it } from "vitest";
import { analyzeStructure } from "../../services/structureService";
import { extractFromPages } from "../../services/pdfExtraction/pipeline/extractAcademicPdf";
import { FIXTURES } from "../readingOrder/builders";
import { grobidEnricher } from "../../services/pdfExtraction/enrichers/grobid";
import { doclingEnricher } from "../../services/pdfExtraction/enrichers/docling";
import { nativeDocumentFromExtracted } from "../../services/pdfExtraction/native/fromExtracted";
import { generateGenericCandidates } from "../../services/pdfExtraction/generic/candidates";

describe("canonical extraction pipeline", () => {
  it("projects Japanese conference headings with CHILD_OF parents", () => {
    const pages = FIXTURES["japanese-conference"]();
    const result = extractFromPages({
      pages,
      paperId: "ja",
      filePath: "/tmp/ja.pdf",
      fileHash: "h",
      metadata: { pageCount: 1 },
    });
    expect(result.paper.titleOriginal).toMatch(/情報採餌理論/);
    const intro = result.sections.find((s) => /1 はじめに/.test(s.originalTitle));
    const sub = result.sections.find((s) => /2\.1/.test(s.originalTitle));
    expect(intro).toBeTruthy();
    expect(sub?.parentSectionId).toBe(intro?.id);
    expect(result.canonical.relations.some((r) => r.kind === "CHILD_OF")).toBe(true);
    expect(result.canonical.relations.some((r) => r.kind === "READS_BEFORE")).toBe(true);
    expect(result.canonical.relations.some((r) => r.kind === "CAPTION_OF")).toBe(true);
    expect(result.blocks.some((b) => b.type === "figure")).toBe(true);
    expect(result.blocks[0]?.metadata.sourceAnchor).toBeTruthy();
    expect(result.blocks[0]?.metadata.evidence).toBeTruthy();
  });

  it("keeps analyzeStructure as a projection wrapper", () => {
    const pages = FIXTURES["classification-index"]();
    const viaWrapper = analyzeStructure(pages, "p", "/tmp/c.pdf", "h", { pageCount: 1 });
    const viaPipeline = extractFromPages({
      pages,
      paperId: "p",
      filePath: "/tmp/c.pdf",
      fileHash: "h",
      metadata: { pageCount: 1 },
    });
    expect(viaWrapper.paper.titleOriginal).toBe(viaPipeline.paper.titleOriginal);
    expect(viaWrapper.blocks.map((b) => b.type)).toEqual(
      viaPipeline.blocks.map((b) => b.type)
    );
  });

  it("does not attach heading evidence to metadata blocks", () => {
    const candidates = generateGenericCandidates(FIXTURES["single-column"]()).candidates;
    const title = candidates.find((candidate) => candidate.role === "title");
    expect(title).toBeTruthy();
    expect(title?.roleScores.heading).toBeUndefined();
  });

  it("emits page-local grid evidence for captionless numeric rows", () => {
    const textItems = Array.from({ length: 6 }, (_, row) => [
      { text: `R${row + 1}`, x: 80, y: 120 + row * 18, width: 18, height: 8, fontSize: 8, fontName: "Body", page: 1 },
      { text: `${(1.1 + row / 10).toFixed(2)}`, x: 180, y: 120 + row * 18, width: 30, height: 8, fontSize: 8, fontName: "Body", page: 1 },
      { text: `${(2.2 + row / 10).toFixed(2)}`, x: 240, y: 120 + row * 18, width: 30, height: 8, fontSize: 8, fontName: "Body", page: 1 },
      { text: `${(3.3 + row / 10).toFixed(2)}`, x: 300, y: 120 + row * 18, width: 30, height: 8, fontSize: 8, fontName: "Body", page: 1 },
    ]).flat();
    const candidates = generateGenericCandidates([{ pageNumber: 1, width: 500, height: 700, textItems }]).candidates;
    expect(candidates.filter((candidate) => (candidate.roleScores.table ?? 0) >= 0.94).length).toBeGreaterThanOrEqual(6);
  });

  it("keeps repeated chart-axis labels out of table evidence", () => {
    const textItems = Array.from({ length: 5 }, (_, index) => ({
      text: `${(index * 0.005).toFixed(3)}`,
      x: 70,
      y: 120 + index * 18,
      width: 30,
      height: 8,
      fontSize: 8,
      fontName: "Helvetica",
      page: 1,
    }));
    const candidates = generateGenericCandidates([
      { pageNumber: 1, width: 500, height: 700, textItems },
    ]).candidates;
    const chartLabels = candidates.filter((candidate) =>
      candidate.evidence.some((evidence) => evidence.label === "repeated-numeric-chart-label")
    );
    expect(chartLabels.length).toBeGreaterThanOrEqual(3);
    expect(chartLabels.every((candidate) => (candidate.roleScores.table ?? 0) < 0.94)).toBe(true);
    const projected = extractFromPages({
      pages: [{ pageNumber: 1, width: 500, height: 700, textItems }],
      paperId: "chart-labels",
      filePath: "/tmp/chart.pdf",
      fileHash: "chart",
      metadata: { pageCount: 1 },
    });
    expect(projected.blocks.filter((block) => block.metadata.translationInputWarning?.includes("chart label"))
      .every((block) => block.translationStatus === "skipped")).toBe(true);
  });

  it("does not run GROBID or Docling without a local service", () => {
    const pages = FIXTURES["single-column"]();
    const native = nativeDocumentFromExtracted(pages, { pageCount: 1 });
    const ctx = { native, pages };
    expect(grobidEnricher.shouldRun(ctx)).toBe(false);
    expect(doclingEnricher.shouldRun(ctx)).toBe(false);
  });
});
