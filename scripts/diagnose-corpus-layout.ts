import fs from "node:fs";
import path from "node:path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { reconstructDocument } from "../src/services/pdfLayout";

const root = path.resolve(".");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/real-papers/catalog.json"), "utf8"));
const pdfDir = path.join(root, catalog.pdfDir);
const reports = [] as Array<{ id: string; formatFamily?: string; pages: number; suspiciousBlocks: number }>;
for (const paper of catalog.papers) {
  const pdfPath = path.join(pdfDir, paper.filename);
  if (!fs.existsSync(pdfPath)) continue;
  const pages = await extractPdfPages(pdfPath);
  const { blocks } = reconstructDocument(pages);
  const suspiciousBlocks = blocks.filter((block) => {
    if (block.role !== "paragraph" || block.lines.length < 4) return false;
    const widths = block.lines.map((line) => line.width).filter((width) => width > 0).sort((a, b) => a - b);
    const typical = widths[Math.floor(widths.length / 2)] ?? 1;
    const xs = [...new Set(block.lines.map((line) => Math.round(line.x)))].sort((a, b) => a - b);
    let clusters = 0;
    for (const x of xs) if (clusters === 0 || x - xs[Math.max(0, xs.indexOf(x) - 1)] > 24) clusters++;
    return block.bbox.width >= typical * 1.65 && clusters >= 2;
  }).length;
  reports.push({ id: paper.id, formatFamily: paper.formatFamily, pages: pages.length, suspiciousBlocks });
}
const output = { version: "pdf-layout-corpus-diagnostic-v1", papers: reports.length, totalPages: reports.reduce((sum, r) => sum + r.pages, 0), totalSuspiciousBlocks: reports.reduce((sum, r) => sum + r.suspiciousBlocks, 0), reports };
const outputPath = process.argv[2];
if (outputPath) fs.writeFileSync(path.resolve(outputPath), JSON.stringify(output, null, 2) + "\n");
else console.log(JSON.stringify(output, null, 2));
