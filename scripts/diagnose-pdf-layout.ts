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
  geometryFlags: {
    mixedColumns: boolean;
    xPositionJump: boolean;
    continuationMarker: boolean;
    listLike: boolean;
  };
  text: string;
  lines: Array<{
    y: number;
    x: number;
    width: number;
    text: string;
    items: Array<{ x: number; width: number; text: string; fontSize: number; fontName: string }>;
  }>;
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
    geometryFlags: {
      mixedColumns: new Set(block.lines.map((line) => line.column)).size > 1,
      xPositionJump: block.lines.some((line, lineIndex) => {
        const previous = block.lines[lineIndex - 1];
        return previous !== undefined && Math.abs(line.x - previous.x) > Math.max(24, typicalWidth * 0.35);
      }),
      continuationMarker: /\(continued on (?:the )?next page\)|continued on next page/i.test(block.text),
      listLike: block.lines.some((line) => /^(?:[-–—•‣∙]|\([a-z]\)|\d+[.)])\s+/i.test(line.text.trim())),
    },
    text: block.text.slice(0, 240),
    lines: block.lines.map((line) => ({
      y: line.y,
      x: line.x,
      width: line.width,
      text: line.text,
      items: line.items.map((item) => ({
        x: item.x,
        width: item.width,
        text: item.text,
        fontSize: item.fontSize,
        fontName: item.fontName,
      })),
    })),
  }];
});
const report = { version: "pdf-layout-diagnostic-v1", pdf: pdfPath, pages: pages.length, suspiciousBlocks: suspicious };
const output = process.argv[3];
if (output) fs.writeFileSync(path.resolve(output), JSON.stringify(report, null, 2) + "\n");
else console.log(JSON.stringify(report, null, 2));
