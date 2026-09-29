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
  const output = path.join(root, "test-data/real-papers/reports", `extraction-blocks-${id}.json`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify({ paperId: id, filePath, blockCount: blocks.length, blocks }, null, 2)}\n`);
  console.log(`wrote ${output} blocks=${blocks.length}`);
}
