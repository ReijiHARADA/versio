import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { reconstructDocument } from "../src/services/pdfLayout.ts";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { evaluateBaselinePaper } from "../src/services/pdfExtraction/benchmark.ts";

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");
const id = process.argv[2];
if (!id) throw new Error("paper id required");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/real-papers/catalog.json"), "utf8"));
const paper = catalog.papers.find((item: { id: string }) => item.id === id);
if (!paper) throw new Error(`unknown paper: ${id}`);
const pdfPath = path.join(root, catalog.pdfDir, paper.filename);
const pages = await extractPdfPages(pdfPath);
const { blocks } = reconstructDocument(pages);
const gtPath = path.join(root, "test-fixtures/real-papers/ground-truth", `${paper.id}.json`);
const gt = fs.existsSync(gtPath) ? JSON.parse(fs.readFileSync(gtPath, "utf8")) : undefined;
const report = evaluateBaselinePaper({
  id: paper.id,
  filename: paper.filename,
  pages,
  blocks,
  catalogFormatFamily: paper.formatFamily,
  catalogTitle: paper.title,
  groundTruth: gt ? { ...gt, authors: gt.authors?.length ? gt.authors : paper.authors } : { id: paper.id, title: paper.title, authors: paper.authors },
});
process.stdout.write(JSON.stringify(report));
