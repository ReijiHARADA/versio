/**
 * Dump production PDF extraction geometry and conservative paragraph-continuation
 * candidates for a single PDF. This is diagnostic only; it never mutates the
 * extraction pipeline or changes resolver behavior.
 *
 * Usage:
 *   npx vite-node scripts/diagnose-extraction-geometry.ts paper.pdf [output.json]
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf.ts";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { isSentenceContinuation } from "../src/services/pdfLayout.ts";

const pdfPath = process.argv[2];
if (!pdfPath) throw new Error("Usage: diagnose-extraction-geometry.ts <paper.pdf> [output.json]");
const resolvedPdf = path.resolve(pdfPath);
const bytes = fs.readFileSync(resolvedPdf);
const pages = await extractPdfPages(resolvedPdf);
const result = extractFromPages({
  pages,
  paperId: path.basename(resolvedPdf, path.extname(resolvedPdf)),
  filePath: resolvedPdf,
  fileHash: crypto.createHash("sha256").update(bytes).digest("hex"),
  metadata: { pageCount: pages.length },
});

const blocks = result.layoutBlocks.map((block: any, index: number) => ({
  index,
  role: block.role,
  pageStart: block.pageStart,
  pageEnd: block.pageEnd,
  column: block.column,
  text: block.text,
  bbox: block.bbox,
  lines: (block.lines ?? []).map((line: any) => ({
    page: line.page,
    column: line.column,
    x: line.x,
    y: line.y,
    width: line.width,
    height: line.height,
    overlayBbox: line.overlayBbox,
    fontSize: line.fontSize,
    fontNames: [...new Set((line.items ?? []).map((item: any) => item.fontName).filter(Boolean))],
    text: line.text,
    items: (line.items ?? []).map((item: any) => ({
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      fontName: item.fontName,
      fontSize: item.fontSize,
      text: item.text,
      visualTop: item.visualTop,
    })),
  })),
}));

// Vector-only figures have no image placement. Report dense ruled-graphics
// regions and the native text blocks intersecting them so a future resolver
// change can be evaluated from geometry evidence without changing production
// extraction in this diagnostic pass.
const vectorGraphicRegions = pages.flatMap((page) => {
  const lines = (page.graphicsPrimitives ?? []).filter((item: any) => item.kind === "line");
  if (lines.length < 8) return [];
  const components: any[][] = [];
  const overlaps = (a: any, b: any) => {
    const ax1 = a.x + a.width, ay1 = a.y + a.height, bx1 = b.x + b.width, by1 = b.y + b.height;
    return a.x <= bx1 + 6 && b.x <= ax1 + 6 && a.y <= by1 + 6 && b.y <= ay1 + 6;
  };
  for (const line of lines) {
    const target = components.find((component) => component.some((other) => overlaps(line, other)));
    if (target) target.push(line); else components.push([line]);
  }
  return components.flatMap((component, componentIndex) => {
    if (component.length < 8) return [];
    const x0 = Math.min(...component.map((item: any) => item.x));
    const y0 = Math.min(...component.map((item: any) => item.y));
    const x1 = Math.max(...component.map((item: any) => item.x + item.width));
    const y1 = Math.max(...component.map((item: any) => item.y + item.height));
    const horizontal = component.filter((item: any) => item.orientation === "horizontal").length;
    const vertical = component.filter((item: any) => item.orientation === "vertical").length;
    if (horizontal < 3 || vertical < 3 || x1 - x0 < 80 || y1 - y0 < 50) return [];
    const intersects = blocks.filter((block: any) => block.pageStart === page.pageNumber && block.pageEnd === page.pageNumber)
      .filter((block: any) => {
        const b = block.bbox;
        return b && b.x < x1 && x0 < b.x + b.width && b.y < y1 && y0 < b.y + b.height;
      }).map((block: any) => ({ index: block.index, role: block.role, text: String(block.text).slice(0, 240), bbox: block.bbox }));
    return [{ page: page.pageNumber, componentIndex, bbox: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, lineCount: component.length, horizontal, vertical, intersectingBlocks: intersects }];
  });
});

const candidates = [] as Array<Record<string, unknown>>;
for (let i = 1; i < blocks.length; i += 1) {
  const previous = blocks[i - 1];
  const next = blocks[i];
  if (previous.role !== "paragraph" || next.role !== "paragraph") continue;
  const previousText = String(previous.text).trim();
  const nextText = String(next.text).trim();
  if (/[.!?:;"')\]]$/.test(previousText) || !/^[a-z(]/.test(nextText)) continue;
  const previousLine = previous.lines.at(-1);
  const nextLine = next.lines[0];
  if (!previousLine || !nextLine) continue;
  candidates.push({
    previousIndex: previous.index,
    nextIndex: next.index,
    previousPage: previous.pageEnd,
    nextPage: next.pageStart,
    previousColumn: previous.column,
    nextColumn: next.column,
    pageDelta: next.pageStart - previous.pageEnd,
    xDelta: Math.abs((previousLine.x ?? 0) - (nextLine.x ?? 0)),
    yPrevious: previousLine.y,
    yNext: nextLine.y,
    baselineGap: (nextLine.y ?? 0) - (previousLine.y ?? 0),
    previousLineHeight: previousLine.height,
    nextLineHeight: nextLine.height,
    relativeGap: ((nextLine.y ?? 0) - (previousLine.y ?? 0)) /
      Math.max(previousLine.height ?? 1, nextLine.height ?? 1),
    fontSizeDelta: Math.abs((previousLine.fontSize ?? 0) - (nextLine.fontSize ?? 0)),
    textContinuation: isSentenceContinuation(previousText, nextText),
    previousTail: previousText.slice(-180),
    nextHead: nextText.slice(0, 180),
  });
}

// Also report paragraph continuations hidden behind visual floats/labels. This
// is diagnostic only: it deliberately does not relabel or merge any block.
const interleavedCandidates = [] as Array<Record<string, unknown>>;
for (let i = 0; i < blocks.length; i += 1) {
  const previous = blocks[i];
  if (previous.role !== "paragraph" || /[.!?:;"')\]]$/.test(String(previous.text).trim())) continue;
  for (let j = i + 2; j < Math.min(blocks.length, i + 24); j += 1) {
    const next = blocks[j];
    if (next.role !== "paragraph" || !/^[a-z(]/.test(String(next.text).trim())) continue;
    if (next.pageStart - previous.pageEnd < 0 || next.pageStart - previous.pageEnd > 1) continue;
    if (!isSentenceContinuation(String(previous.text), String(next.text))) continue;
    const skipped = blocks.slice(i + 1, j);
    interleavedCandidates.push({
      previousIndex: previous.index,
      nextIndex: next.index,
      pageDelta: next.pageStart - previous.pageEnd,
      previousTail: String(previous.text).slice(-180),
      nextHead: String(next.text).slice(0, 180),
      skipped: skipped.map((item) => ({
        index: item.index,
        role: item.role,
        pageStart: item.pageStart,
        pageEnd: item.pageEnd,
        fontSizes: item.lines.map((line: any) => line.fontSize),
        text: String(item.text).slice(0, 120),
      })),
    });
    break;
  }
}

const output = {
  version: "extraction-geometry-diagnostic-v1",
  pdf: resolvedPdf,
  pageCount: pages.length,
  blockCount: blocks.length,
  candidateCount: candidates.length,
  interleavedCandidateCount: interleavedCandidates.length,
  blocks,
  candidates,
  interleavedCandidates,
  vectorGraphicRegions,
  canonicalNodes: result.canonical.nodes.map((node) => ({
    id: node.id,
    role: node.role,
    pageStart: node.pageStart,
    pageEnd: node.pageEnd,
    boundingBoxes: node.boundingBoxes,
    overlayBoundingBoxes: node.overlayBoundingBoxes,
    text: node.text,
  })),
};
const outputPath = path.resolve(process.argv[3] ?? `${resolvedPdf}.extraction-geometry.json`);
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, pageCount: pages.length, blockCount: blocks.length, candidateCount: candidates.length }, null, 2));
