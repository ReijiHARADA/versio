import fs from "node:fs";
import path from "node:path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { reconstructDocument } from "../src/services/pdfLayout";

const root = path.resolve(".");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/real-papers/catalog.json"), "utf8"));
const pdfDir = path.join(root, catalog.pdfDir);
const reports = [] as Array<{ id: string; formatFamily?: string; pages: number; suspiciousBlocks: number; samples: Array<{ page: number; xClusters: number[]; columns: string[]; text: string }> }>;
for (const paper of catalog.papers) {
  const pdfPath = path.join(pdfDir, paper.filename);
  if (!fs.existsSync(pdfPath)) continue;
  const pages = await extractPdfPages(pdfPath);
  const { blocks } = reconstructDocument(pages);
  const suspicious = blocks.filter((block) => {
    if (block.role !== "paragraph" || block.lines.length < 4) return false;
    const widths = block.lines.map((line) => line.width).filter((width) => width > 0).sort((a, b) => a - b);
    const typical = widths[Math.floor(widths.length / 2)] ?? 1;
    const xs = [...new Set(block.lines.map((line) => Math.round(line.x)))].sort((a, b) => a - b);
    let clusters = 0;
    let previous: number | undefined;
    for (const x of xs) {
      if (previous === undefined || x - previous > 24) clusters++;
      previous = x;
    }
    return block.bbox.width >= typical * 1.65 && clusters >= 2;
  });
  reports.push({
    id: paper.id,
    formatFamily: paper.formatFamily,
    pages: pages.length,
    suspiciousBlocks: suspicious.length,
    samples: suspicious.slice(0, 5).map((block) => ({
      page: block.pageStart,
      xClusters: [...new Set(block.lines.map((line) => Math.round(line.x)))].sort((a, b) => a - b),
      columns: [...new Set(block.lines.map((line) => line.column))],
      text: block.text.slice(0, 240),
    })),
  });
}
const output = { version: "pdf-layout-corpus-diagnostic-v1", papers: reports.length, totalPages: reports.reduce((sum, r) => sum + r.pages, 0), totalSuspiciousBlocks: reports.reduce((sum, r) => sum + r.suspiciousBlocks, 0), reports };
const byFormat = new Map<string, { papers: number; pages: number; suspiciousBlocks: number }>();
for (const report of reports) {
  const key = report.formatFamily ?? "unknown";
  const current = byFormat.get(key) ?? { papers: 0, pages: 0, suspiciousBlocks: 0 };
  current.papers++;
  current.pages += report.pages;
  current.suspiciousBlocks += report.suspiciousBlocks;
  byFormat.set(key, current);
}
Object.assign(output, { byFormat: Object.fromEntries(byFormat) });
const outputPath = process.argv[2];
if (outputPath) fs.writeFileSync(path.resolve(outputPath), JSON.stringify(output, null, 2) + "\n");
else console.log(JSON.stringify(output, null, 2));
