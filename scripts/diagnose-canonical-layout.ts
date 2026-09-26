import fs from "node:fs";
import path from "node:path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";

const input = process.argv[2];
const query = process.argv.slice(3).join(" ").trim();
if (!input) throw new Error("Usage: npx vite-node scripts/diagnose-canonical-layout.ts <pdf> [text query]");

const pdfPath = path.resolve(input);
const pages = await extractPdfPages(pdfPath);
const result = extractFromPages({
  pages,
  paperId: "canonical-diagnostic",
  filePath: pdfPath,
  fileHash: "canonical-diagnostic",
  metadata: { pageCount: pages.length },
});
const matches = (text: string | null | undefined) => !query || (text ?? "").toLowerCase().includes(query.toLowerCase());
const layoutMatches = result.layoutBlocks
  .filter((block) => matches(block.text))
  .map((block) => ({
    role: block.role,
    pageStart: block.pageStart,
    pageEnd: block.pageEnd,
    column: block.column,
    bbox: block.bbox,
    text: block.text,
  }));
const canonicalMatches = result.canonical.nodes
  .filter((node) => matches(node.text))
  .map((node) => ({
    id: node.id,
    role: node.role,
    pageStart: node.pageStart,
    pageEnd: node.pageEnd,
    text: node.text ?? "",
    evidence: node.evidence,
  }));
const report = {
  version: "canonical-layout-diagnostic-v1",
  pdf: pdfPath,
  query: query || null,
  pages: pages.length,
  layoutMatches,
  canonicalMatches,
};
const output = process.env.CANONICAL_LAYOUT_DIAGNOSTIC_OUTPUT;
if (output) fs.writeFileSync(path.resolve(output), JSON.stringify(report, null, 2) + "\n");
else console.log(JSON.stringify(report, null, 2));
