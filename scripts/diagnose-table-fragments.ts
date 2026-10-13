import path from "node:path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";
import { attachLinesToBlocks } from "../src/data/package/layoutFromExtraction";

const file = process.argv[2];
if (!file) throw new Error("usage: vite-node --script scripts/diagnose-table-fragments.ts <pdf>");
const filePath = path.resolve(file);
const pages = await extractPdfPages(filePath);
const extracted = extractFromPages({
  pages,
  paperId: "table-fragment-diagnostic",
  filePath,
  fileHash: filePath,
  metadata: { pageCount: pages.length },
});
const attached = attachLinesToBlocks(extracted.blocks, extracted.layoutBlocks);
for (const block of attached.filter((item) => item.type === "table" && !/^\s*(?:table|表)\s*\d+/i.test(String(item.metadata.captionOriginal ?? item.original ?? "")))) {
  const rows = (block.metadata as { tableRows?: unknown }).tableRows;
  const source = block.original?.replace(/\s+/g, " ").slice(0, 180) ?? "";
  const layout = extracted.layoutBlocks.find((item) => item.pageStart === block.pageStart && item.text === block.original);
  console.log(JSON.stringify({
    page: block.pageStart,
    column: block.metadata.column,
    role: block.metadata.role,
    source,
    blockBox: block.boundingBoxes[0],
    exactLayoutMatch: Boolean(layout),
    layoutLines: layout?.lines.length ?? 0,
    layoutItemCounts: layout?.lines.map((line) => line.items.length) ?? [],
    tableRows: Array.isArray(rows) ? rows.map((row) => Array.isArray(row) ? row.map((cell) => (cell as { text?: string }).text) : row) : null,
  }));
}
