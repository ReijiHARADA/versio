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
      if (paper.id === "marketing-consumer-production-journey") {
        const stitchedParagraph = blocks.find((block) =>
          block.text.includes("The first dimension describes the extent to which consumers are active")
        );
        expect(stitchedParagraph?.pageStart).toBe(3);
        expect(stitchedParagraph?.pageEnd).toBe(3);
        const introductionContinuation = blocks.find((block) =>
          block.text.includes("enable them to produce new value for other consumers")
        );
        expect(introductionContinuation?.pageStart).toBe(1);
        expect(introductionContinuation?.text).not.toContain("Special Issue Editor");
        const citationContinuation = blocks.find((block) =>
          block.text.includes("Muth 1966), the prominent shift")
        );
        expect(citationContinuation?.pageStart).toBe(1);
        expect(citationContinuation?.pageEnd).toBeGreaterThan(1);
        const fullExtraction = extractFromPages({
          pages,
          paperId: paper.id,
          filePath: paper.filename,
          fileHash: "table-row-regression",
          metadata: { title: paper.title, pageCount: pages.length },
        });
        const advertisingTableCells = fullExtraction.blocks.find((block) =>
          block.original.includes("Personalization using an algorithm results in better performance")
        );
        expect(advertisingTableCells?.metadata.role).toBe("table");
        expect(advertisingTableCells?.translationStatus).toBe("skipped");
        expect(advertisingTableCells?.metadata.tableSourceFallback).toBe(true);
        const consumerProductionTableCells = fullExtraction.blocks.find((block) =>
          block.original.includes("Co-design and recommend products") &&
          block.original.includes("Offer peer support, review, and innovate")
        );
        expect(consumerProductionTableCells?.type).toBe("table");
        expect(consumerProductionTableCells?.translationStatus).toBe("skipped");
        const marketingValueTableCells = fullExtraction.blocks.find((block) =>
          block.original.includes("Greater consumption skills") &&
          block.original.includes("Commercial gains from co-production")
        );
        expect(marketingValueTableCells?.metadata.role).toBe("table");
        expect(marketingValueTableCells?.translationStatus).toBe("skipped");
        expect(marketingValueTableCells?.metadata.tableSourceFallback).toBe(true);
        const marketingJourneyTableRow = fullExtraction.blocks.find((block) =>
          block.original.includes("3. Experience") && block.original.includes("Consumption experience")
        );
        expect(marketingJourneyTableRow?.metadata.role).toBe("table");
        expect(marketingJourneyTableRow?.translationStatus).toBe("skipped");
        expect(marketingJourneyTableRow?.metadata.tableSourceFallback).toBe(true);
        const marketingJourneyLastTableRow = fullExtraction.blocks.find((block) =>
          block.original.includes("4. Reflect") && block.original.includes("care for products")
        );
        expect(marketingJourneyLastTableRow?.metadata.role).toBe("table");
        expect(marketingJourneyLastTableRow?.translationStatus).toBe("skipped");
        expect(marketingJourneyLastTableRow?.metadata.tableSourceFallback).toBe(true);
      }
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
      if (paper.id === "social-influence-social-advertising" || paper.id === "modeling-human-behavior-cognitive-uncertainty") {
        expect(report.titleExact).toBe(true);
        expect(report.titlePredicted?.toLowerCase()).not.toMatch(/arxiv:/);
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
      if (paper.id === "speechin") {
        const row = extractFromPages({ pages, paperId: "bench-speechin-row", filePath: paper.filename, fileHash: paper.id, metadata: { title: paper.title, pageCount: pages.length } }).blocks.find((block) => block.original?.startsWith("SpeeChin One camera"));
        expect(row?.type).toBe("table");
        expect(row?.translationStatus).toBe("skipped");
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
    it("stitches the Wear Scale lead across author metadata without importing the affiliation", async () => {
      const pages = await extractPdfPages(wear.pdfPath);
      const result = extractFromPages({
        pages,
        paperId: wear.paper.id,
        filePath: wear.pdfPath,
        fileHash: "regression",
        metadata: { title: wear.paper.title, pageCount: pages.length },
      });
      const lead = result.blocks.find((block) =>
        block.type === "paragraph" && block.original.startsWith("The wearable acceptability range")
      );

      expect(lead?.original).toContain("consumer behaviour");
      expect(lead?.original).toContain("extended WEAR Scale to the apparel field by");
      expect(lead?.original).not.toContain("Department of Events");
    }, 60_000);

    it("projects rotated numeric table rows without translating them", async () => {
      const pages = await extractPdfPages(wear.pdfPath);
      const result = await extractFromPages({
        pages,
        paperId: wear.paper.id,
        filePath: wear.pdfPath,
        fileHash: "regression",
        metadata: { title: wear.paper.title, pageCount: pages.length },
      });
      const pageFourteenTables = result.blocks.filter(
        (block) => block.pageStart === 14 && block.type === "table"
      );
      expect(pageFourteenTables.length).toBeGreaterThan(0);
      expect(pageFourteenTables.every((block) => block.translationStatus === "skipped")).toBe(true);
    }, 60_000);
  }

});
