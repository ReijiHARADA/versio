import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { reconstructDocument } from "../../services/pdfLayout";
import { attachLinesToBlocks } from "../../data/package/layoutFromExtraction";
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
  // Real-paper extraction may include embedded fonts, vector-heavy pages, and
  // large table regions. Keep the corpus regression bounded, but do not fail
  // a valid extraction merely because the default 180s worker budget is too
  // small for one large document on macOS.
  const REAL_PAPER_TEST_TIMEOUT_MS = 600_000;
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
        const referenceSectionIds = new Set(fullExtraction.sections
          .filter((section) => section.normalizedKind === "references")
          .map((section) => section.id));
        const marketingReferences = fullExtraction.blocks.filter((block) =>
          block.sectionId && referenceSectionIds.has(block.sectionId) && block.type !== "heading"
        );
        expect(marketingReferences.length).toBeGreaterThan(5);
        expect(marketingReferences.every((block) => block.type === "reference")).toBe(true);
        expect(marketingReferences.every((block) => block.translationStatus === "skipped")).toBe(true);
      }
      if (paper.id === "ergonomics-fatigue-and-occupational-safety-in-short-haul-light-transport") {
        const fullExtraction = extractFromPages({
          pages,
          paperId: paper.id,
          filePath: pdfPath,
          fileHash: "sequential-native-table-row-regression",
          metadata: { title: paper.title, pageCount: pages.length },
        });
        const vehicleRows = fullExtraction.blocks.find((block) =>
          block.type === "table" &&
          block.original.includes("Articulated trucks") &&
          block.original.includes("Passenger vehicles") &&
          block.original.includes("Total motor vehicles")
        );
        const rows = vehicleRows?.metadata.tableRows as Array<Array<{ text: string }>> | undefined;
        expect(vehicleRows?.metadata.sequentialRowsMerged).toBeGreaterThanOrEqual(3);
        expect(rows?.map((row) => row.map((cell) => cell.text).join(" "))).toEqual(expect.arrayContaining([
          expect.stringContaining("Articulated trucks"),
          expect.stringContaining("Passenger vehicles"),
          expect.stringContaining("Total motor vehicles"),
        ]));
        const commercialTable = fullExtraction.blocks.find((block) =>
          block.pageStart === 25 && block.type === "table" &&
          block.original.includes("Total freight, million t") &&
          block.original.includes("161 (7.7)")
        );
        const commercialRows = commercialTable?.metadata.tableRows as Array<Array<{ text: string }>> | undefined;
        expect(commercialTable?.translationStatus).toBe("skipped");
        expect(commercialRows?.length).toBeGreaterThanOrEqual(8);
        expect(fullExtraction.blocks.some((block) =>
          block.pageStart === 25 && block.type === "table" &&
          block.original.includes("Articulated trucks")
        )).toBe(true);
        expect(fullExtraction.blocks.some((block) =>
          block.pageStart === 25 && block.type === "paragraph" &&
          block.original.includes("161 (7.7)")
        )).toBe(false);
      }
      if (paper.id === "cognitive-dual-task-older-adults") {
        const fullExtraction = extractFromPages({
          pages,
          paperId: paper.id,
          filePath: paper.filename,
          fileHash: "completed-prose-table-guard",
          metadata: { title: paper.title, pageCount: pages.length },
        });
        // This is statistical result prose immediately below a figure/table
        // area. It used to inherit a distant header signal and become a
        // skipped source-only table even though it is a complete sentence.
        const resultProse = fullExtraction.blocks.find((block) =>
          block.original.startsWith("PVF (r=0.461; p=0.040, n=25).")
        );
        expect(resultProse?.type).toBe("paragraph");
        expect(resultProse?.translationStatus).toBe("pending");
      }
      if (paper.id === "cognitive-psychology-cognitive-psychology-first-language-and-false-memories") {
        const fullExtraction = extractFromPages({
          pages,
          paperId: paper.id,
          filePath: paper.filename,
          fileHash: "wrapped-prose-headered-table-guard",
          metadata: { title: paper.title, pageCount: pages.length },
        });
        const abstractLead = fullExtraction.blocks.find((block) =>
          block.original.startsWith("When bilinguals perform a memory task")
        );
        expect(fullExtraction.canonical.nodes.find((node) =>
          node.role === "title" && node.text.startsWith("Cognitive Psychology: First language")
        )).toBeTruthy();
        expect(abstractLead?.type).toBe("paragraph");
        expect(abstractLead?.translationStatus).toBe("pending");
      }
      if ([
        "interactive-jewellery",
        "significant-other",
        "design-for-wearability",
        "step-to-charge",
        "neuroscience-rule-following",
      ].includes(paper.id)) {
        const referenceExtraction = extractFromPages({
          pages,
          paperId: paper.id,
          filePath: pdfPath,
          fileHash: "cross-format-reference-regression",
          metadata: { title: paper.title, pageCount: pages.length },
        });
        const referenceSectionIds = new Set(referenceExtraction.sections
          .filter((section) => section.normalizedKind === "references")
          .map((section) => section.id));
        const referenceSectionBlocks = referenceExtraction.blocks.filter((block) =>
          block.sectionId && referenceSectionIds.has(block.sectionId)
        );
        if (paper.id === "interactive-jewellery") {
          expect(referenceExtraction.paper.authors).toEqual([
            "Maarten Versteeg",
            "Elise van den Hoven",
            "Caroline Hummels",
          ]);
          expect(referenceExtraction.paper.affiliations.map((affiliation) => affiliation.name)).toEqual(expect.arrayContaining([
            "Department of Industrial Design Eindhoven University of Technology The Netherlands",
            "Faculty of Design, Architecture & Building University of Technology Sydney Australia",
            "Duncan of Jordanstone College of Art and Design University of Dundee",
            "Australian Research Centre of Excellence in Cognition and its Disorders Australia Macquarie University",
          ]));
          expect(referenceExtraction.paper.authors.some((author) => /Design Cognition|Cognition and its/i.test(author))).toBe(false);
          expect(referenceSectionBlocks.find((block) => block.original.includes("Wear, wearing, worn"))?.type).toBe("reference");
          expect(referenceSectionBlocks.find((block) => block.original.includes("The structure of autobiographical memory"))?.type).toBe("reference");
        }
        if (paper.id === "significant-other") {
          expect(referenceSectionBlocks.find((block) => block.original.startsWith("Marzee Exhibition Catalogue"))?.type).toBe("reference");
        }
        if (paper.id === "design-for-wearability") {
          expect(referenceSectionBlocks.find((block) => block.original.startsWith("1. Tilley"))?.type).toBe("reference");
        }
        if (paper.id === "step-to-charge") {
          const gabriel = referenceSectionBlocks.find((block) => block.original.startsWith("[40] Gabriel"));
          expect(gabriel?.type).toBe("reference");
          expect(gabriel?.metadata.role).toBe("reference");
        }
        if (paper.id === "neuroscience-rule-following") {
          expect(referenceSectionBlocks.find((block) => block.original.startsWith("27, 141–163"))?.type).toBe("reference");
          expect(referenceSectionBlocks.some((block) => block.type === "reference" &&
            /^License, which permits use/i.test(block.original ?? ""))).toBe(false);
          expect(referenceSectionBlocks.some((block) => /^© The Author/i.test(block.original ?? ""))).toBe(false);
        }
      }
      if (paper.id === "cognitive-motor-incidental-memory") {
        const referenceExtraction = extractFromPages({
          pages,
          paperId: paper.id,
          filePath: pdfPath,
          fileHash: "reference-column-split-regression",
          metadata: { title: paper.title, pageCount: pages.length },
        });
        const referenceSectionIds = new Set(referenceExtraction.sections
          .filter((section) => section.normalizedKind === "references")
          .map((section) => section.id));
        const referenceBlocks = referenceExtraction.blocks.filter((block) =>
          block.type === "reference" && block.sectionId && referenceSectionIds.has(block.sectionId)
        );
        // Native text from two-column reference pages can concatenate several
        // entries when a DOI has no terminal period. Each bibliographic entry
        // must remain its own source-only block for stable rendering/export.
        expect(referenceBlocks.some((block) =>
          block.original.includes("Spataro, P.") && block.original.includes("Swallow, K. M., and Jiang, Y. V. (2010)")
        )).toBe(false);
        expect(referenceBlocks.some((block) =>
          block.original.includes("Ushey, K.") && block.original.includes("van Ede, F.")
        )).toBe(false);
        expect(referenceBlocks.some((block) => block.original.startsWith("Spataro, P."))).toBe(true);
        expect(referenceBlocks.some((block) => block.original.startsWith("Wickham, H."))).toBe(true);
      }
      if (paper.id === "cognitive-psychology-gpt3") {
        const projected = extractFromPages({
          pages,
          paperId: paper.id,
          filePath: pdfPath,
          fileHash: "figure-label-regression",
          metadata: { title: paper.title, pageCount: pages.length },
        });
        expect(projected.blocks.some((block) =>
          block.original.includes("Decision-making Information search") && block.translationStatus === "pending"
        )).toBe(false);
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
      if (paper.id === "linguistics-computational-linguistics") {
        expect(report.titlePredicted).toBe("Computational Linguistics");
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
        expect(report.authorF1).toBe(1);
        expect(report.affiliationF1).toBe(1);

        const extracted = extractFromPages({
          pages,
          paperId: paper.id,
          filePath: pdfPath,
          fileHash: "ozchi-content-boundary-regression",
          metadata: { title: paper.title, pageCount: pages.length },
        });
        expect(extracted.paper.authors).toEqual(expect.arrayContaining(["Ashley Colley", "Jonna Häkkilä"]));
        expect(extracted.paper.authors.slice(0, 2)).toEqual(["Ashley Colley", "Jonna Häkkilä"]);
        expect(extracted.paper.affiliations.slice(0, 2).map((affiliation) => affiliation.name)).toEqual([
          "Center for Internet Excellence University Of Oulu Oulu, Finland",
          "Faculty of Art and Design University of Lapland Rovaniemi, Finland",
        ]);
        expect(extracted.blocks.some((block) =>
          /personal or classroom use is granted|permissions?@acm\.org/i.test(block.original)
        )).toBe(false);
        const introduction = extracted.blocks.find((block) =>
          block.original.startsWith("During the past few years, touch screens have rapidly become")
        );
        expect(introduction?.original).toContain("recommended target size for thumb-based input");
        const postTableProse = extracted.blocks.find((block) =>
          block.original.startsWith("Similarly for the gallery application")
        );
        expect(postTableProse?.type).toBe("paragraph");
        expect(postTableProse?.translationStatus).toBe("pending");
        // Borderless p-value matrices must keep their bold axis labels in the
        // source-only table stream; they must not become translated headings.
        const comfortableLabel = extracted.blocks.find((block) => block.original.trim() === "Comfortable");
        expect(comfortableLabel?.type).toBe("table");
        expect(comfortableLabel?.translationStatus).toBe("skipped");
        const table3Grid = extracted.blocks.find((block) =>
          block.original.includes("Finger Function Thumb Call tapped contact")
        );
        expect(table3Grid?.type).toBe("table");
        expect(table3Grid?.translationStatus).toBe("skipped");
        expect(table3Grid?.metadata.tableRows).toEqual(expect.arrayContaining([
          expect.arrayContaining([
            expect.objectContaining({ text: "Finger" }),
            expect.objectContaining({ text: "Function" }),
          ]),
        ]));
        // A borderless native table may not have a raster crop. Attach its
        // same-baseline cells to the numbered caption, so the Reader renders
        // one labelled grid instead of a separate flattened cell card.
        const packageReadyBlocks = attachLinesToBlocks(extracted.blocks, extracted.layoutBlocks);
        const table4Cells = packageReadyBlocks.find((block) =>
          block.original.startsWith("Table 4.")
        )?.metadata.tableRows as Array<Array<{ text: string }>> | undefined;
        expect(table4Cells?.[0]?.map((cell) => cell.text)).toEqual(["Finger", "Phonebook", "Gallery"]);
        expect(table4Cells?.some((row) => row.some((cell) =>
          cell.text.includes("Show sharing context menu (email, sms, etc.)")
        ))).toBe(true);
        expect(table4Cells?.some((row) => row.some((cell) => cell.text.includes("contact card")))).toBe(true);
        expect(table4Cells?.some((row) => row.length >= 2)).toBe(true);
        expect(packageReadyBlocks.some((block) =>
          block.original.includes("Finger Phonebook Gallery Thumb")
        )).toBe(false);

        const referenceBlocks = extracted.blocks.filter((block) =>
          block.sectionId && extracted.sections.some((section) =>
            section.id === block.sectionId && section.normalizedKind === "references"
          )
        );
        expect(referenceBlocks.length).toBeGreaterThan(10);
        expect(referenceBlocks.every((block) => block.type === "reference" || block.type === "heading")).toBe(true);
        expect(referenceBlocks.filter((block) => block.type === "reference").every((block) =>
          block.translationStatus === "skipped"
        )).toBe(true);
        const tapSense = extracted.blocks.find((block) =>
          block.original.includes("TapSense: enhancing finger interaction")
        );
        expect(tapSense?.type).toBe("reference");
        expect(tapSense?.original).toContain("UIST '11. ACM, 627-636.");
        const teleGlove = extracted.blocks.find((block) =>
          block.original.includes("The Making of the TeleGlove")
        );
        expect(teleGlove?.type).toBe("reference");
        expect(teleGlove?.translationStatus).toBe("skipped");
      }
      if (paper.id === "speechin") {
        const speechinExtraction = extractFromPages({ pages, paperId: "bench-speechin-row", filePath: paper.filename, fileHash: paper.id, metadata: { title: paper.title, pageCount: pages.length } });
        const row = speechinExtraction.blocks.find((block) => block.original?.startsWith("SpeeChin One camera"));
        expect(row?.type).toBe("table");
        expect(row?.translationStatus).toBe("skipped");
        const wearableTechniqueTable = speechinExtraction.blocks.find((block) =>
          block.original?.startsWith("method location size accuracy dependency")
        );
        expect(wearableTechniqueTable?.type).toBe("table");
        expect(wearableTechniqueTable?.translationStatus).toBe("skipped");
        expect(wearableTechniqueTable?.metadata.tableRows).toHaveLength(9);
      }
      if (paper.id === "human-ai-interaction-guidelines") {
        const humanExtraction = extractFromPages({
          pages,
          paperId: paper.id,
          filePath: paper.filename,
          fileHash: "graphic-label-regression",
          metadata: { title: paper.title, pageCount: pages.length },
        });
        const figureLabels = humanExtraction.blocks.filter((block) =>
          block.pageStart === 3 &&
          block.original?.startsWith("Clearly communicate AI limits and capabilities") ||
          block.pageStart === 3 && block.original?.startsWith("Time services based on context")
        );
        expect(figureLabels).toHaveLength(0);
        expect(humanExtraction.blocks.some((block) =>
          block.type === "figure" && block.original?.startsWith("Figure 2: Unified Guideline Structure")
        )).toBe(true);
      }
      if (paper.id === "cognitive-memory-cue-interest") {
        const memoryExtraction = extractFromPages({
          pages,
          paperId: paper.id,
          filePath: paper.filename,
          fileHash: "column-table-header-regression",
          metadata: { title: paper.title, pageCount: pages.length },
        });
        const procedure = memoryExtraction.blocks.find((block) =>
          block.original?.startsWith("The procedure included one encoding phase")
        );
        expect(procedure?.type).toBe("paragraph");
        expect(procedure?.original).not.toContain("Option (Correct");
        expect(memoryExtraction.blocks.some((block) =>
          block.type === "table" && block.original?.includes("Option (Correct")
        )).toBe(true);
      }
      if (paper.id === "linguistics-language-model-physics") {
        const extracted = extractFromPages({
          pages,
          paperId: paper.id,
          filePath: paper.filename,
          fileHash: "graphic-label-regression",
          metadata: { title: paper.title, pageCount: pages.length },
        });
        // Dense plot labels can share a baseline with numeric cells. They have
        // independent vector/axis evidence and must not be revived as a table
        // by the later matrix-neighbour propagation.
        expect(extracted.blocks.some((block) =>
          block.type === "table" && /^lay9 lay9 lay10 lay10$/i.test(block.original?.trim() ?? "")
        )).toBe(false);
        expect(extracted.blocks.some((block) =>
          block.type === "table" && /^truth GPT GPT_rel GPT_rot GPT_pos GPT_uni$/i.test(block.original?.trim() ?? "")
        )).toBe(false);
      }
      if (paper.id === "covid-ml-review") {
        const extracted = extractFromPages({
          pages,
          paperId: paper.id,
          filePath: paper.filename,
          fileHash: "captionless-grid-prose-regression",
          metadata: { title: paper.title, pageCount: pages.length },
        });
        // A long statistical explanation can share a page with numeric plot
        // labels. Without the narrative conflict guard, captionless page-grid
        // evidence hides it as a table and it never reaches translation.
        const prediction = extracted.blocks.find((block) =>
          block.original?.includes("Prediction of epidemic results of")
        );
        expect(prediction?.type).toBe("paragraph");
      }
      if (gt?.listItems) {
        expect(report.listItemRecall).toBeGreaterThanOrEqual(0.9);
      }
    // Real PDFs with large vector/table streams can take substantially longer
    // than the ordinary corpus cases. Keep one corpus-wide timeout so a slow
    // native extraction does not appear as a product regression merely because
    // it crossed a paper-specific threshold.
    }, REAL_PAPER_TEST_TIMEOUT_MS);
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

      const packaged = attachLinesToBlocks(result.blocks, result.layoutBlocks);
      const captionlessGrid = packaged.find((block) =>
        block.pageStart === 6 && block.metadata.captionlessNativeGrid === true &&
        block.original.startsWith("Model How to train your model Google")
      );
      expect(captionlessGrid?.type).toBe("table");
      expect(captionlessGrid?.translationStatus).toBe("skipped");
      expect(captionlessGrid?.metadata.tableRows).toEqual(expect.arrayContaining([
        expect.arrayContaining([
          expect.objectContaining({ text: "Model" }),
          expect.objectContaining({ text: "How to train your model" }),
          expect.objectContaining({ text: "Google" }),
          expect.objectContaining({ text: "Design for experimentation" }),
        ]),
      ]));
      expect((captionlessGrid?.metadata.tableRows as unknown[] | undefined)?.length ?? 0).toBeGreaterThanOrEqual(20);
      expect(packaged.filter((block) => block.pageStart === 6 && block.original === "How to train your model")).toHaveLength(0);
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
