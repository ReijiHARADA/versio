import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { reconstructDocument } from "../../services/pdfLayout";
import { extractPdfPages } from "../readingOrder/extractPdf";
import { evaluateBaselinePaper } from "../../services/pdfExtraction/benchmark";
import { extractFromPages } from "../../services/pdfExtraction/pipeline/extractAcademicPdf";
import type { PartialGroundTruth } from "../../services/pdfExtraction/benchmark";

type CatalogPaper = {
  id: string;
  title: string;
  filename: string;
  formatFamily?: string;
  checks: { tokensInOrder?: string[]; captionContains?: string[]; tableCaptionContains?: string[] };
};

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const catalog = JSON.parse(
  fs.readFileSync(path.join(root, "test-fixtures/real-papers/catalog.json"), "utf8")
) as { pdfDir: string; papers: CatalogPaper[] };

function loadGroundTruth(id: string): PartialGroundTruth | undefined {
  const gtPath = path.join(root, "test-fixtures/real-papers/ground-truth", `${id}.json`);
  if (!fs.existsSync(gtPath)) return undefined;
  return JSON.parse(fs.readFileSync(gtPath, "utf8")) as PartialGroundTruth;
}

describe("baseline benchmark on cached real papers", () => {
  const available = catalog.papers.flatMap((paper) => {
    const pdfPath = path.join(root, catalog.pdfDir, paper.filename);
    return fs.existsSync(pdfPath) ? [{ paper, pdfPath }] : [];
  });

  it("skips cleanly when the corpus is not cached", () => {
    if (available.length === 0) {
      console.warn("No real papers cached; baseline benchmark skipped");
    }
    expect(true).toBe(true);
  });

  for (const { paper, pdfPath } of available) {
    it(`${paper.id} baseline + format detection`, async () => {
      const pages = await extractPdfPages(pdfPath);
      const { blocks } = reconstructDocument(pages);
      const gt = loadGroundTruth(paper.id);
      const report = evaluateBaselinePaper({
        id: paper.id,
        filename: paper.filename,
        pages,
        blocks,
        catalogFormatFamily: paper.formatFamily,
        catalogTitle: paper.title,
        groundTruth: gt
          ? {
              ...gt,
              tokensInOrder:
                gt.tokensInOrder ??
                (paper.checks.tokensInOrder && paper.checks.tokensInOrder.length >= 2
                  ? [paper.checks.tokensInOrder[0], paper.checks.tokensInOrder[1]]
                  : undefined),
              figureCaptions: gt.figureCaptions ?? paper.checks.captionContains,
              tableCaptions: gt.tableCaptions ?? paper.checks.tableCaptionContains,
            }
          : {
              id: paper.id,
              title: paper.title,
              figureCaptions: paper.checks.captionContains,
              tableCaptions: paper.checks.tableCaptionContains,
            },
      });

      expect(report.pageKind === "scanned" || report.scannedByItemAverage).toBe(false);
      if (report.titleExact !== undefined) {
        expect(typeof report.titleExact).toBe("boolean");
      }
      if (paper.formatFamily === "acm-acmart" && report.formatApplied === "acm") {
        expect(report.formatScores.acm).toBeGreaterThanOrEqual(0.75);
      }
      if (paper.formatFamily === "ieee-conference" && report.formatApplied === "ieee") {
        expect(report.formatScores.ieee).toBeGreaterThanOrEqual(0.75);
      }
      if (report.formatApplied === "acm" && paper.formatFamily && paper.formatFamily !== "unknown") {
        expect(paper.formatFamily.startsWith("acm")).toBe(true);
      }
      if (report.formatApplied === "ieee" && paper.formatFamily) {
        expect(paper.formatFamily.startsWith("ieee")).toBe(true);
      }
      if (paper.id === "ozchi-finger-specific-touch") {
        expect(report.headingRecall).toBeGreaterThanOrEqual(0.9);
        expect(report.headingHierarchyAccuracy).toBeGreaterThanOrEqual(0.75);
        expect(report.tableCaptionRecall).toBe(1);
        expect(report.tableRegionRecall).toBeGreaterThanOrEqual(0.8);
      }
      if (gt?.listItems) {
        expect(report.listItemRecall).toBeGreaterThanOrEqual(0.9);
      }
    }, 60_000);
  }

  const ppg = available.find(({ paper }) => paper.id === "ppg-earring");
  if (ppg) {
    it("preserves a captionless native grid as a non-translated table block", async () => {
      const pages = await extractPdfPages(ppg.pdfPath);
      const result = extractFromPages({
        pages,
        paperId: ppg.paper.id,
        filePath: ppg.pdfPath,
        fileHash: "regression",
        metadata: { title: ppg.paper.title, pageCount: pages.length },
      });
      const canonical = result.canonical.nodes.find((node) =>
        node.text?.startsWith("Component Weight Earring PCB")
      );
      expect(canonical?.role).toBe("table");
      const projected = result.blocks.find((block) =>
        block.original.startsWith("Component Weight Earring PCB")
      );
      expect(projected?.type).toBe("table");
      expect(projected?.translationStatus).toBe("skipped");
      const hyphenatedContinuation = result.canonical.nodes.find((node) =>
        node.text?.trim().startsWith("- achieves 74.55")
      );
      expect(hyphenatedContinuation?.role).toBe("paragraph");
    }, 60_000);
  }

  const wear = available.find(({ paper }) => paper.id === "wear-scale");
  if (wear) {
    it("keeps a long flattened numeric matrix out of translation", async () => {
      const pages = await extractPdfPages(wear.pdfPath);
      const result = extractFromPages({
        pages,
        paperId: wear.paper.id,
        filePath: wear.pdfPath,
        fileHash: "regression",
        metadata: { title: wear.paper.title, pageCount: pages.length },
      });
      const matrixRows = result.blocks.filter((block) =>
        block.pageStart === 14 && block.type === "table" && /^[+−-]?\d/.test(block.original.trim())
      );
      expect(matrixRows.length).toBeGreaterThanOrEqual(10);
      expect(matrixRows.every((block) => block.translationStatus === "skipped")).toBe(true);
    }, 60_000);
  }

});
