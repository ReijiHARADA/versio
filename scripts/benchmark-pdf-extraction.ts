/**
 * Baseline academic-PDF extraction benchmark. Does not change import.
 *
 *   npx tsx scripts/benchmark-pdf-extraction.ts --papers interactive-jewellery,thermal-earring
 *   npx tsx scripts/benchmark-pdf-extraction.ts --all
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { reconstructDocument } from "../src/services/pdfLayout.ts";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { evaluateBaselinePaper } from "../src/services/pdfExtraction/benchmark.ts";
import type { BaselinePaperReport, PartialGroundTruth } from "../src/services/pdfExtraction/benchmark.ts";

type CatalogPaper = {
  id: string;
  title: string;
  filename: string;
  authors?: string[];
  formatFamily?: string;
  checks: { tokensInOrder?: string[]; captionContains?: string[]; tableCaptionContains?: string[] };
};

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");
const args = process.argv.slice(2);
const papersIndex = args.indexOf("--papers");
const requestedIds = papersIndex >= 0
  ? new Set((args[papersIndex + 1] ?? "").split(",").map((id) => id.trim()).filter(Boolean))
  : undefined;
const runAll = args.includes("--all");
const catalog = JSON.parse(
  fs.readFileSync(path.join(root, "test-fixtures/real-papers/catalog.json"), "utf8")
) as { pdfDir: string; papers: CatalogPaper[] };

if (!requestedIds && !runAll && catalog.papers.length > 12) {
  throw new Error("抽出全件ベンチマークには --all を明示してください。通常は --papers id1,id2 で重点fixtureを指定します。");
}

const reports: BaselinePaperReport[] = [];
for (const paper of catalog.papers) {
  if (requestedIds && !requestedIds.has(paper.id)) continue;
  const pdfPath = path.join(root, catalog.pdfDir, paper.filename);
  if (!fs.existsSync(pdfPath)) continue;
  const pages = await extractPdfPages(pdfPath);
  const { blocks } = reconstructDocument(pages);
  const gtPath = path.join(
    root,
    "test-fixtures/real-papers/ground-truth",
    `${paper.id}.json`
  );
  const gt = fs.existsSync(gtPath)
    ? (JSON.parse(fs.readFileSync(gtPath, "utf8")) as PartialGroundTruth)
    : undefined;
  // Catalog authors are independently verified acquisition metadata. Use
  // them as a presence/normalization benchmark when a fixture has no richer
  // hand-authored ground truth; do not overwrite explicit fixture labels.
  const benchmarkGroundTruth = gt
    ? { ...gt, authors: gt.authors?.length ? gt.authors : paper.authors }
    : { id: paper.id, title: paper.title, authors: paper.authors };
  reports.push(
    evaluateBaselinePaper({
      id: paper.id,
      filename: paper.filename,
      pages,
      blocks,
      catalogFormatFamily: paper.formatFamily,
      catalogTitle: paper.title,
      groundTruth: benchmarkGroundTruth,
    })
  );
}

type BooleanMetric = "titleExact" | "nativeTitleExact";
type NumericMetric = "authorF1" | "affiliationF1" | "headingRecall" | "headingPrecision" |
  "headingHierarchyAccuracy" | "readingOrderPair" | "figureCaptionRecall" |
  "tableCaptionRecall" | "tableRegionRecall" | "tableRegionPrecision" |
  "sourceIntegrityRate" | "canonicalProvenanceRate";

function booleanSummary(key: BooleanMetric) {
  const known = reports.filter((report) => report[key] !== undefined);
  const hits = known.filter((report) => report[key] === true);
  return { evaluated: known.length, passed: hits.length, rate: known.length ? hits.length / known.length : null };
}

function numericSummary(key: NumericMetric) {
  const values = reports
    .map((report) => report[key])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return {
    evaluated: values.length,
    mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    min: values.length ? Math.min(...values) : null,
  };
}

const result = {
  version: "extraction-baseline-v2",
  generatedAt: new Date().toISOString(),
  papers: reports.length,
  // Reader title is allowed to use verified catalog metadata as a conservative
  // fallback. Native title measures are kept separate so this report never
  // mistakes metadata recovery for successful PDF-title extraction.
  summary: {
    readerTitleExact: booleanSummary("titleExact"),
    nativeTitleExact: booleanSummary("nativeTitleExact"),
    metadataTitleFallbacks: reports.filter((report) => report.titleUsedMetadataFallback).length,
    authorF1: numericSummary("authorF1"),
    affiliationF1: numericSummary("affiliationF1"),
    headingRecall: numericSummary("headingRecall"),
    headingPrecision: numericSummary("headingPrecision"),
    headingHierarchyAccuracy: numericSummary("headingHierarchyAccuracy"),
    readingOrderPair: numericSummary("readingOrderPair"),
    figureCaptionRecall: numericSummary("figureCaptionRecall"),
    tableCaptionRecall: numericSummary("tableCaptionRecall"),
    tableRegionRecall: numericSummary("tableRegionRecall"),
    tableRegionPrecision: numericSummary("tableRegionPrecision"),
    sourceIntegrityRate: numericSummary("sourceIntegrityRate"),
    canonicalProvenanceRate: numericSummary("canonicalProvenanceRate"),
  },
  reports,
};
const reportPath = path.join(root, "test-data/real-papers/reports/extraction-baseline-latest.json");
fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ ...result, reportPath }, null, 2));
