import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";

const root = process.cwd();
const ids = process.argv.slice(2);
if (ids.length === 0) throw new Error("usage: vite-node --script scripts/diagnose-paper-blocks.ts <paper-id> [...]");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/real-papers/catalog.json"), "utf8"));
for (const id of ids) {
  const paper = catalog.papers.find((candidate: any) => candidate.id === id);
  if (!paper) throw new Error(`unknown paper: ${id}`);
  const filePath = path.join(root, catalog.pdfDir, paper.filename);
  const bytes = fs.readFileSync(filePath);
  const pages = await extractPdfPages(filePath);
  const result = extractFromPages({
    pages, paperId: id, filePath, fileHash: crypto.createHash("sha256").update(bytes).digest("hex"),
    metadata: { title: paper.title, author: paper.authors?.join(", "), pageCount: pages.length },
  });
  const blocks = result.canonical.nodes
    .filter((node: any) => ["paragraph", "abstract", "heading"].includes(node.role))
    .map((node: any) => ({ id: node.id, role: node.role, pageStart: node.pageStart, pageEnd: node.pageEnd, column: node.column, bbox: node.bbox, boundingBoxes: node.boundingBoxes, lineCount: node.lines?.length, evidenceKeys: node.evidence?.map((item: any) => Object.keys(item)), evidence: node.evidence, text: node.text }));
  const roleCounts = result.canonical.nodes.reduce<Record<string, number>>((counts, node) => {
    counts[node.role] = (counts[node.role] ?? 0) + 1;
    return counts;
  }, {});
  const canonicalNodes = result.canonical.nodes.map((node) => ({
    id: node.id,
    role: node.role,
    pageStart: node.pageStart,
    pageEnd: node.pageEnd,
    boundingBoxes: node.boundingBoxes,
    structuralLabel: node.structuralLabel,
    confidence: node.confidence,
    evidence: node.evidence,
    text: node.text,
  }));
  const layoutBlocks = result.layoutBlocks.map((block) => ({
    role: block.role,
    pageStart: block.pageStart,
    pageEnd: block.pageEnd,
    column: block.column,
    bbox: block.bbox,
    lines: block.lines.map((line) => ({
      text: line.text,
      x: line.x,
      y: line.y,
      width: line.width,
      height: line.height,
      fontSize: line.fontSize,
      fontNames: [...new Set(line.items.map((item) => item.fontName).filter(Boolean))],
      items: line.items.map((item) => ({
        text: item.text,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        fontSize: item.fontSize,
        fontName: item.fontName,
        rotation: item.rotation,
      })),
      column: line.column,
    })),
    text: block.text,
  }));
  const output = path.join(root, "test-data/real-papers/reports", `extraction-blocks-${id}.json`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify({
    paperId: id,
    filePath,
    pageKind: result.pageKind,
    paper: result.paper,
    sections: result.sections,
    projectedBlockCount: result.blocks.length,
    projectedBlocks: result.blocks,
    roleCounts,
    canonicalNodeCount: canonicalNodes.length,
    canonicalNodes,
    layoutBlockCount: layoutBlocks.length,
    layoutBlocks,
    selectedReadableBlockCount: blocks.length,
    blocks,
  }, null, 2)}\n`);
  console.log(`wrote ${output} blocks=${blocks.length}`);
}
