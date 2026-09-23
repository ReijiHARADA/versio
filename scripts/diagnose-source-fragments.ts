/**
 * Analyze neighboring canonical blocks for known source-fragment candidates.
 * This is diagnostic-only and does not alter extraction or translation.
 */
import fs from "node:fs";
import path from "node:path";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf.ts";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";

const root = process.cwd();
const catalog = JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/real-papers/catalog.json"), "utf8"));
const ids = process.argv.slice(2);
const targets = new Map([
  ["interpreting-neural-networks", "A statistical interaction describes"],
  ["hfe-healthcare-scoping-2024", "scoping"],
  ["hfe-healthcare-scoping-2024", "static visual display"],
]);
const selected = catalog.papers.filter((p: { id: string }) => ids.length === 0 ? targets.has(p.id) : ids.includes(p.id));
const output: unknown[] = [];
for (const paper of selected) {
  const pdfPath = path.join(root, catalog.pdfDir, paper.filename);
  if (!fs.existsSync(pdfPath)) continue;
  const pages = await extractPdfPages(pdfPath);
  const extracted = extractFromPages({ pages, paperId: `fragment-diagnostic-${paper.id}`, filePath: paper.filename, fileHash: paper.id, metadata: { title: paper.title, pageCount: pages.length } });
  const blocks = extracted.blocks;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.type !== "paragraph") continue;
    const matched = [...targets.entries()].some(([id, needle]) => id === paper.id && (block.original ?? "").toLowerCase().includes(needle.toLowerCase()));
    if (!matched) continue;
    const neighbors = [blocks[i - 1], blocks[i + 1]].filter(Boolean).map((b) => ({ id: b.id, type: b.type, pageStart: b.pageStart, pageEnd: b.pageEnd, text: (b.original ?? "").slice(0, 500), bboxCount: b.boundingBoxes.length }));
    output.push({ paperId: paper.id, blockId: block.id, type: block.type, pageStart: block.pageStart, pageEnd: block.pageEnd, text: block.original, extractionConfidence: block.extractionConfidence, boundingBoxes: block.boundingBoxes, neighbors });
  }
}
const out = path.join(root, "test-data/real-papers/reports/source-fragment-neighborhood-v1.json");
fs.writeFileSync(out, `${JSON.stringify({ version: "source-fragment-neighborhood-v1", createdAt: new Date().toISOString(), rows: output }, null, 2)}\n`);
console.log(`wrote ${out} (${output.length} rows)`);
