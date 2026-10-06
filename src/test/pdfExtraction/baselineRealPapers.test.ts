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
  checks?: { tokensInOrder?: string[]; captionContains?: string[]; tableCaptionContains?: string[] };
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
      if (paper.id === "ppg-earring") {
        const abstractHeading = blocks.find((block) => block.text.trim() === "Abstract");
        expect(abstractHeading?.role).toBe("heading");
        const stitchedAbstract = blocks.find((block) =>
          block.text.startsWith("Heart rate is a key vital sign")
        );
        expect(stitchedAbstract?.text).toContain("only 54.88% of the time");
        expect(stitchedAbstract?.text).toContain("which measures 14 mm in diameter");
        expect(stitchedAbstract?.text).toContain("To address this, we developed PPG Earring");
        expect(stitchedAbstract?.text).not.toMatch(/\bOur$/);
        expect(stitchedAbstract?.text).not.toContain("ThisnationalworkLicense");
        expect(stitchedAbstract?.text).not.toContain("Creative Commons");
        expect(blocks.some((block) => block.text.trim().startsWith("which measures 14 mm"))).toBe(false);
        const license = blocks.find((block) => /Creative Commons Attribution-NoDerivatives/i.test(block.text));
        expect(license?.role).toBe("copyright");
      }
      if (paper.id === "marketing-consumer-production-journey") {
        const abstract = blocks.find((block) =>
          block.text.startsWith("New digital technologies not only support consumers")
        );
        expect(abstract?.text).toContain("analyze how marketing can support consumers’ co-production activities.");
        expect(abstract?.text).toContain("We discuss the managerial and consumer welfare implications");
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
        const consumerProductionBody = fullExtraction.blocks.find((block) =>
          block.original.startsWith("(Wirtz et al. 2003). When they become co-producers")
        );
        expect(consumerProductionBody?.type).toBe("paragraph");
        expect(consumerProductionBody?.metadata.tableSourceFallback).not.toBe(true);
        expect(consumerProductionBody?.translationStatus).toBe("pending");
        const flattenedNetworkTableRow = fullExtraction.blocks.find((block) =>
          block.original.startsWith("Consumer co-production network Brodie et al. (2013)")
        );
        const flattenedReviewTableRow = fullExtraction.blocks.find((block) =>
          block.original.startsWith("Mathwick and Mosteller Review products Survey")
        );
        expect(flattenedNetworkTableRow?.type).toBe("table");
        expect(flattenedNetworkTableRow?.translationStatus).toBe("skipped");
        expect(flattenedReviewTableRow?.metadata.role).toBe("table");
        expect(flattenedReviewTableRow?.metadata.tableSourceFallback).toBe(true);
        expect(flattenedReviewTableRow?.translationStatus).toBe("skipped");
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
      if (paper.id === "ergonomics-quantified-factory-worker") {
        const crossPageParagraph = blocks.find((block) =>
          block.text.includes("Personal feedback means also that the application is intended")
        );
        expect(crossPageParagraph?.pageStart).toBe(3);
        expect(crossPageParagraph?.pageEnd).toBe(4);
        expect(crossPageParagraph?.text).not.toMatch(/^1\s+3\s+means also/);
        expect(blocks.some((block) => block.role === "footer" && block.text.trim() === "1 3")).toBe(true);
      }
      if (paper.id === "cognitive-vr-mnemonic-processing") {
        const methodText = blocks.find((block) => block.text.includes("participants had to mark"));
        expect(methodText?.text).not.toContain("15 February 2023");
        const figureFive = blocks.find((block) => block.role === "figure_caption" && block.text.includes("FIGURE 5"));
        expect(figureFive?.text).toContain("Significant differences between groups");
        expect(figureFive?.text).toContain("p<0.001");
        const discussionContinuation = blocks.find((block) => block.text.startsWith("The present study aimed to further clarify"));
        expect(discussionContinuation?.pageStart).toBe(3);
        expect(discussionContinuation?.pageEnd).toBe(5);
        expect(discussionContinuation?.text).toContain("by comparing memory performance after learning information");
        expect(discussionContinuation?.text).toContain("self-relevance of the situation");
        expect(discussionContinuation?.text).toMatch(/rules regarding the spatial arrangement of the building blocks\.$/);
      }
      if (paper.id === "marketing-health-goals-nudging") {
        const extraction = extractFromPages({
          pages,
          paperId: paper.id,
          filePath: paper.filename,
          fileHash: "cross-column-table-evidence-regression",
          metadata: { title: paper.title, pageCount: pages.length },
        });
        const resultsProse = extraction.blocks.find((block) =>
          block.original.startsWith("We first examined whether implicit attention")
        );
        expect(resultsProse?.type).toBe("paragraph");
        expect(resultsProse?.metadata.tableSourceFallback).not.toBe(true);
        expect(resultsProse?.translationStatus).toBe("pending");
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
              figureCaptions: gt.figureCaptions ?? paper.checks?.captionContains,
              tableCaptions: gt.tableCaptions ?? paper.checks?.tableCaptionContains,
            }
          : {
              id: paper.id,
              title: paper.title,
              figureCaptions: paper.checks?.captionContains,
              tableCaptions: paper.checks?.tableCaptionContains,
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
      if (paper.id === "ergonomics-analisis-pemetaan-bibliometrik-komputational-publikasi-pada-ergonomics") {
        expect(report.titlePredicted).toContain("Human Factor");
        expect(report.titlePredicted).toContain("VOSviewer");
      }
      if (paper.id === "marketing-impact-of-green-marketing-on-consumer-behavior") {
        expect(report.titlePredicted).toMatch(/IMPACT OF GREEN MARKETING ON CONSUMER BEHAVIOU?R/i);
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
    // Real PDFs with large vector/table streams can take substantially longer
    // than the ordinary corpus cases. Keep one corpus-wide timeout so a slow
    // native extraction does not appear as a product regression merely because
    // it crossed a paper-specific threshold.
    }, 180_000);
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
        node.text?.includes("achieves 74.55")
      );
      expect(hyphenatedContinuation?.role).toBe("paragraph");
    }, 60_000);
  }

  const humanAiGuidelines = available.find(({ paper }) => paper.id === "human-ai-interaction-guidelines");
  if (humanAiGuidelines) {
    it("stitches a paragraph across a floated table while keeping table content separate", async () => {
      const pages = await extractPdfPages(humanAiGuidelines.pdfPath);
      const result = extractFromPages({
        pages,
        paperId: humanAiGuidelines.paper.id,
        filePath: humanAiGuidelines.pdfPath,
        fileHash: "regression",
        metadata: { title: humanAiGuidelines.paper.title, pageCount: pages.length },
      });
      const narrative = result.blocks.find((block) =>
        block.original.includes("as a standalone document, it may help result in a greater overall synthesis")
      );
      const table = result.blocks.find((block) => block.original.startsWith("Table 1: Total number of guidelines"));
      expect(narrative?.type).toBe("paragraph");
      expect(narrative?.original).toContain("potential issues as a standalone document");
      expect(narrative?.metadata.tableSourceFallback).not.toBe(true);
      expect(narrative?.metadata.translationInputWarning ?? "").not.toContain("段落の先頭が前段から続いている可能性");
      expect(table?.type).toBe("table");

      const continuation = result.canonical.relations.find((relation) =>
        relation.kind === "CONTINUES" &&
        result.canonical.nodes.find((node) => node.id === relation.from)?.text?.endsWith("potential issues") &&
        result.canonical.nodes.find((node) => node.id === relation.to)?.text?.startsWith("as a standalone document")
      );
      expect(continuation?.score).toBe(0.9);
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
      expect(result.paper.authors).toEqual(expect.arrayContaining(["Changhyun Nam", "Young‑A Lee"]));
      expect(result.paper.authors).not.toEqual(expect.arrayContaining(["Correspondence:", "Teaching Assistant Professor"]));
      expect(result.paper.affiliations?.some((item) => /Iowa State University/i.test(item.name))).toBe(true);
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
