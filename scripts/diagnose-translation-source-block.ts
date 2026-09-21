import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";
import type { ExtractedPage } from "../src/services/pdfService";
import type { BoundingBox } from "../src/types/paper";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";

type CatalogPaper = {
  id: string;
  title: string;
  filename: string;
  doi?: string | null;
  sourceUrl?: string;
  oaStatus?: string;
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [paperId, blockId, outputPath] = process.argv.slice(2);
if (!paperId || !blockId) {
  throw new Error("Usage: vite-node --script scripts/diagnose-translation-source-block.ts <paperId> <blockId|text:substring|all> [outputPath]");
}

const catalog = JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/real-papers/catalog.json"), "utf8")) as {
  pdfDir: string;
  papers: CatalogPaper[];
};
const paper = catalog.papers.find((entry) => entry.id === paperId);
if (!paper) throw new Error(`Unknown catalog paper: ${paperId}`);
const pdfPath = path.join(root, catalog.pdfDir, paper.filename);
if (!fs.existsSync(pdfPath)) throw new Error(`Missing local PDF: ${pdfPath}`);

const pdfBytes = fs.readFileSync(pdfPath);
const pages = await extractPdfPages(pdfPath);
const savedLog = console.log;
const savedInfo = console.info;
const savedWarn = console.warn;
let extracted;
try {
  console.log = () => {};
  console.info = () => {};
  console.warn = () => {};
  extracted = extractFromPages({
    pages,
    paperId,
    filePath: pdfPath,
    fileHash: createHash("sha256").update(pdfBytes).digest("hex"),
    metadata: { title: paper.title, pageCount: pages.length },
  });
} finally {
  console.log = savedLog;
  console.info = savedInfo;
  console.warn = savedWarn;
}
const matchingBlocks = blockId === "all"
  ? extracted.blocks
  : blockId.startsWith("text:")
    ? extracted.blocks.filter((entry) => (entry.original ?? "").toLowerCase().includes(blockId.slice("text:".length).toLowerCase()))
    : extracted.blocks.filter((entry) => entry.id === blockId);
if (matchingBlocks.length === 0) {
  throw new Error(`No block matched ${blockId}; available blocks=${extracted.blocks.map((entry) => `${entry.id}: ${(entry.original ?? "").slice(0, 100)}`).join(" | ")}`);
}
if (matchingBlocks.length > 1 && blockId !== "all") {
  process.stderr.write(`matched ${matchingBlocks.length} blocks; emitting all matches\n`);
}
const intersects = (a: BoundingBox, b: BoundingBox, padding = 0) =>
  a.page === b.page &&
  a.x <= b.x + b.width + padding && a.x + a.width + padding >= b.x &&
  a.y <= b.y + b.height + padding && a.y + a.height + padding >= b.y;
const diagnostics = matchingBlocks.map((block) => {
if (blockId === "all") {
  return {
    block: {
      id: block.id,
      role: block.type,
      pageStart: block.pageStart,
      pageEnd: block.pageEnd,
      text: block.original,
      extractionConfidence: block.extractionConfidence,
      boundingBoxes: block.boundingBoxes,
      metadata: block.metadata,
    },
  };
}
const targetBoxes = block.boundingBoxes;
const pageNumbers = [...new Set(targetBoxes.map((box) => box.page))].sort((a, b) => a - b);
const diagnosticPages = pages.filter((page) => pageNumbers.some((n) => Math.abs(n - page.pageNumber) <= 1));

function groupLines(page: ExtractedPage) {
  const items = [...page.textItems].sort((a, b) => a.y - b.y || a.x - b.x);
  const groups: Array<{ y: number; items: typeof items }> = [];
  for (const item of items) {
    let group = groups.at(-1);
    if (!group || Math.abs(group.y - item.y) > Math.max(2.5, item.height * 0.35)) {
      group = { y: item.y, items: [] };
      groups.push(group);
    }
    group.items.push(item);
    group.y = group.items.reduce((sum, entry) => sum + entry.y, 0) / group.items.length;
  }
  return groups.map((group) => {
    const x = Math.min(...group.items.map((item) => item.x));
    const right = Math.max(...group.items.map((item) => item.x + item.width));
    const top = Math.min(...group.items.map((item) => item.y));
    const bottom = Math.max(...group.items.map((item) => item.y + item.height));
    const lineBox: BoundingBox = { page: page.pageNumber, x, y: top, width: right - x, height: bottom - top };
    const targetOverlap = targetBoxes.some((box) => intersects(lineBox, box, 1));
    return {
      y: Math.round(group.y * 10) / 10,
      x: Math.round(x * 10) / 10,
      width: Math.round((right - x) * 10) / 10,
      targetOverlap,
      text: group.items.map((item) => item.text).join(" ").replace(/\s+/g, " ").trim(),
      fonts: [...new Set(group.items.map((item) => `${item.fontName}@${Math.round(item.fontSize * 10) / 10}`))],
      items: group.items.map((item) => ({
        text: item.text,
        x: Math.round(item.x * 10) / 10,
        y: Math.round(item.y * 10) / 10,
        width: Math.round(item.width * 10) / 10,
        height: Math.round(item.height * 10) / 10,
        fontName: item.fontName,
        fontSize: Math.round(item.fontSize * 10) / 10,
      })),
    };
  });
}

const nearbyLayouts = extracted.layoutBlocks
  .filter((layout) => pageNumbers.some((page) => Math.abs(page - layout.pageStart) <= 1))
  .map((layout) => ({
    role: layout.role,
    pageStart: layout.pageStart,
    pageEnd: layout.pageEnd,
    column: layout.column,
    bbox: layout.bbox,
    text: layout.text,
    lines: layout.lines.map((line) => ({
      text: line.text,
      x: line.bbox.x,
      y: line.bbox.y,
      width: line.bbox.width,
      height: line.bbox.height,
      fonts: [...new Set(line.items.map((item) => `${item.fontName}@${Math.round(item.fontSize * 10) / 10}`))],
    })),
    overlapsTarget: targetBoxes.some((box) => intersects(layout.bbox, box, 4)),
  }));

const nearbyNodes = extracted.canonical.nodes
  .filter((node) => pageNumbers.some((page) => Math.abs(page - node.pageStart) <= 1))
  .map((node) => ({
    id: node.id,
    role: node.role,
    pageStart: node.pageStart,
    pageEnd: node.pageEnd,
    confidence: node.confidence,
    bbox: node.boundingBoxes,
    text: node.text,
    evidence: node.evidence,
    overlapsTarget: node.boundingBoxes.some((nodeBox) => targetBoxes.some((box) => intersects(nodeBox, box, 4))),
  }));

return {
  block: {
    id: block.id,
    role: block.type,
    pageStart: block.pageStart,
    pageEnd: block.pageEnd,
    text: block.original,
    translated: block.translated,
    extractionConfidence: block.extractionConfidence,
    boundingBoxes: block.boundingBoxes,
    metadata: block.metadata,
  },
  pageGeometry: diagnosticPages.map((page) => ({
    page: page.pageNumber,
    width: page.width,
    height: page.height,
    lines: groupLines(page),
  })),
  pageLayouts: extracted.layouts.filter((layout) => pageNumbers.some((page) => Math.abs(page - layout.page) <= 1)),
  nearbyLayoutBlocks: nearbyLayouts,
  nearbyCanonicalNodes: nearbyNodes,
};
});

/*
 * Per-paper selector implementation. Keep all block output available in one
 * pass so block IDs may change after a layout fix without losing the case.
 */
const diagnostic = {
  paper: { id: paper.id, title: paper.title, doi: paper.doi, sourceUrl: paper.sourceUrl, oaStatus: paper.oaStatus, pdf: paper.filename },
  pdfSha256: createHash("sha256").update(pdfBytes).digest("hex"),
  matchedBlockCount: diagnostics.length,
  diagnostics,
};
const json = `${JSON.stringify(diagnostic, null, 2)}\n`;
if (outputPath) {
  const absoluteOutputPath = path.resolve(root, outputPath);
  fs.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true });
  fs.writeFileSync(absoluteOutputPath, json);
  process.stdout.write(`wrote ${absoluteOutputPath}\n`);
} else {
  process.stdout.write(json);
}
