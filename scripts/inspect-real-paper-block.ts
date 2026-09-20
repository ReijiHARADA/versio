/**
 * Inspect a Paper Reader extraction block and its immediate neighbors from a
 * local, legally obtained regression PDF. This is diagnostic only; it never
 * mutates the source PDF, extraction pipeline, or generated benchmark report.
 *
 * Usage:
 *   npx vite-node --script scripts/inspect-real-paper-block.ts <pdf> <block-id-or-text> [paper-id] [neighbor-count]
 */
import path from "node:path";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf.ts";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";

const [, , inputPdf, query, requestedPaperId, neighborCountArg] = process.argv;
if (!inputPdf || !query) {
  throw new Error("Usage: inspect-real-paper-block.ts <pdf> <block-id-or-text> [paper-id]");
}

const pdfPath = path.resolve(inputPdf);
const paperId = requestedPaperId ?? path.basename(pdfPath, path.extname(pdfPath));
const pages = await extractPdfPages(pdfPath);
const originalLog = console.log;
const originalInfo = console.info;
const originalWarn = console.warn;
let document: ReturnType<typeof extractFromPages>;
try {
  console.log = () => {};
  console.info = () => {};
  if (process.env.PDF_LAYOUT_DEBUG !== "1") console.warn = () => {};
  document = extractFromPages({
    pages,
    paperId: `translation-audit-${paperId}`,
    filePath: path.basename(pdfPath),
    fileHash: paperId,
    metadata: { pageCount: pages.length },
  });
} finally {
  console.log = originalLog;
  console.info = originalInfo;
  console.warn = originalWarn;
}
const blocks = document.blocks;
const matchIndex = blocks.findIndex((block) => block.id === query || (block.original ?? "").includes(query));
if (matchIndex < 0) throw new Error(`No extraction block matched: ${query}`);

const neighborCount = Math.max(0, Number(neighborCountArg ?? 2));
const firstIndex = Math.max(0, matchIndex - neighborCount);
const lastIndex = Math.min(blocks.length, matchIndex + neighborCount + 1);
const inspected = blocks.slice(firstIndex, lastIndex);
const report = inspected.map((block, offset) => {
  const index = firstIndex + offset;
  const canonicalNode = document.canonical.nodes.find((node) => node.text === block.original);
  const layoutBlock = document.layoutBlocks.find((candidate) => candidate.text === block.original);
  return {
    index,
    id: block.id,
    selected: index === matchIndex,
    role: block.type,
    section: block.sectionTitle,
    pageStart: block.pageStart,
    pageEnd: block.pageEnd,
    original: block.original,
    bboxCount: block.boundingBoxes?.length ?? 0,
    boundingBoxes: block.boundingBoxes,
    extractionConfidence: block.extractionConfidence,
    metadata: block.metadata,
    canonicalEvidence: canonicalNode?.evidence,
    layoutDetail: layoutBlock ? {
      role: layoutBlock.role,
      column: layoutBlock.column,
      lineCount: layoutBlock.lines.length,
      lines: layoutBlock.lines.map((line) => ({
        x: line.x, y: line.y, width: line.width, fontSize: line.fontSize, column: line.column, page: line.page,
        itemCount: line.items.length,
        items: line.items.map((item) => ({ text: item.text, x: item.x, width: item.width, fontName: item.fontName, fontSize: item.fontSize })),
      })),
    } : undefined,
  };
});
const firstPage = Math.max(1, inspected[0].pageStart);
const lastPage = Math.min(pages.length, inspected.at(-1)!.pageEnd);
const nativeTextItems = pages
  .filter((page) => page.pageNumber >= firstPage && page.pageNumber <= lastPage)
  .map((page) => ({
    page: page.pageNumber,
    items: [...page.textItems]
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((item) => ({
        text: item.text,
        x: Math.round(item.x * 10) / 10,
        y: Math.round(item.y * 10) / 10,
        width: Math.round(item.width * 10) / 10,
        height: Math.round(item.height * 10) / 10,
        fontName: item.fontName,
        fontSize: Math.round(item.fontSize * 10) / 10,
      })),
  }));
console.log(JSON.stringify({ pdfPath, pages: pages.length, query, selectedIndex: matchIndex, blocks: report, nativeTextItems }, null, 2));
