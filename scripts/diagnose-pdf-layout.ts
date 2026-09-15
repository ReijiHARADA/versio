import fs from "node:fs";
import path from "node:path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { reconstructDocument } from "../src/services/pdfLayout";

type SuspiciousBlock = {
  index: number;
  page: number;
  role: string;
  lineCount: number;
  bbox: { x: number; y: number; width: number; height: number };
  columns: string[];
  xClusters: number[];
  text: string;
};

function clusterXs(xs: number[]): number[] {
  const sorted = [...xs].sort((a, b) => a - b);
  const clusters: number[] = [];
  for (const x of sorted) {
    const last = clusters.at(-1);
    if (last === undefined || x - last > 24) clusters.push(x);
    else clusters[clusters.length - 1] = (last + x) / 2;
  }
  return clusters.map((x) => Math.round(x * 10) / 10);
}

const input = process.argv[2];
if (!input) throw new Error("Usage: tsx scripts/diagnose-pdf-layout.ts <pdf> [output.json]");
const pdfPath = path.resolve(input);
const pages = await extractPdfPages(pdfPath);
const { blocks } = reconstructDocument(pages);
const suspicious: SuspiciousBlock[] = blocks.flatMap((block, index) => {
  if (block.role !== "paragraph" || block.lines.length < 4) return [];
  const widths = block.lines.map((line) => line.width).filter((width) => width > 0);
  const typicalWidth = widths.sort((a, b) => a - b)[Math.floor(widths.length / 2)] ?? 1;
  const xClusters = clusterXs(block.lines.map((line) => line.x));
  if (block.bbox.width < typicalWidth * 1.65 || xClusters.length < 2) return [];
  return [{
    index,
    page: block.pageStart,
    role: block.role,
    lineCount: block.lines.length,
    bbox: block.bbox,
    columns: [...new Set(block.lines.map((line) => line.column))],
    xClusters,
    text: block.text.slice(0, 240),
  }];
});
const report = { version: "pdf-layout-diagnostic-v1", pdf: pdfPath, pages: pages.length, suspiciousBlocks: suspicious };
const output = process.argv[3];
if (output) fs.writeFileSync(path.resolve(output), JSON.stringify(report, null, 2) + "\n");
else console.log(JSON.stringify(report, null, 2));
