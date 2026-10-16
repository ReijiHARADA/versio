/** Diagnostic-only production extraction dump for a PDF outside the fixture catalog. */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { extractFromPages, extractAcademicPdf } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf.ts";

const input = process.argv[2];
if (!input) throw new Error("usage: vite-node --script scripts/diagnose-external-paper.ts <pdf> [output.json]");
const pdfPath = path.resolve(input);
const bytes = fs.readFileSync(pdfPath);
const pages = await extractPdfPages(pdfPath);
const baseInput = {
  paperId: path.basename(pdfPath, path.extname(pdfPath)),
  filePath: pdfPath,
  fileHash: crypto.createHash("sha256").update(bytes).digest("hex"),
  metadata: { pageCount: pages.length },
};
const result = process.env.EXTERNAL_EXTRACT_FIGURES === "1"
  ? await extractAcademicPdf({
      ...baseInput,
      file: new File([bytes], path.basename(pdfPath), { type: "application/pdf" }),
      extractFigures: true,
    })
  : extractFromPages({
  pages,
  ...baseInput,
});
const roleCounts = result.canonical.nodes.reduce<Record<string, number>>((acc, node) => {
  acc[node.role] = (acc[node.role] ?? 0) + 1;
  return acc;
}, {});
const nodes = result.canonical.nodes.map((node) => ({
  id: node.id,
  role: node.role,
  pageStart: node.pageStart,
  pageEnd: node.pageEnd,
  column: node.column,
  bbox: node.boundingBoxes[0],
  text: node.text,
  tableRows: node.metadata?.tableRows,
  captionOriginal: node.metadata?.captionOriginal,
  evidence: node.evidence,
}));
const output = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.resolve("test-data/real-papers/reports/external-paper-diagnostic.json");
const report = {
  version: "external-paper-diagnostic-v1",
  generatedAt: new Date().toISOString(),
  pdfPath,
  pages: pages.length,
  pageKind: result.pageKind,
  roleCounts,
  paper: result.paper,
  sections: result.sections,
  projectedBlocks: result.blocks.length,
  projectedBlockRows: result.blocks.map((block) => ({
    type: block.type,
    pageStart: block.pageStart,
    original: block.original,
    tableRows: block.metadata?.tableRows,
    captionOriginal: block.metadata?.captionOriginal,
  })),
  relations: result.canonical.relations.filter((relation) => relation.kind === "CAPTION_OF"),
  nodes,
};
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, pages: pages.length, roleCounts, paper: result.paper }, null, 2));
