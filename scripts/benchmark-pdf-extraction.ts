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
import type { PartialGroundTruth } from "../src/services/pdfExtraction/benchmark.ts";

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

const reports = [];
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

const titleHits = reports.filter((r) => r.titleExact === true).length;
const titleKnown = reports.filter((r) => r.titleExact !== undefined).length;
const result = {
  version: "extraction-baseline-v1",
  generatedAt: new Date().toISOString(),
  papers: reports.length,
  titleExact: titleKnown === 0 ? null : titleHits / titleKnown,
  reports,
};
const reportPath = path.join(root, "test-data/real-papers/reports/extraction-baseline-latest.json");
fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ ...result, reportPath }, null, 2));
