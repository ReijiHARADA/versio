/** Where reference-looking blocks land (section / type) for one field-gold document (local diagnostics only). */
import fs from "node:fs";
import path from "node:path";
import { selectReferenceBlocks } from "../src/services/pdfExtraction/crf/referenceLines";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";

const root = path.resolve(import.meta.dirname, "..");
const id = process.argv[process.argv.indexOf("--id") + 1];
const pdf = JSON.parse(fs.readFileSync(path.join(root, "test-data/field-gold", id, "gold.json"), "utf8")).pdfPath as string;
const pages = await extractPdfPages(path.join(root, pdf));
const result = extractFromPages({ pages, paperId: id, filePath: pdf, fileHash: id, metadata: { pageCount: pages.length } });
const selected = new Set(selectReferenceBlocks(result.blocks, result.sections));
const title = new Map(result.sections.map((s) => [s.id, `${s.normalizedKind}:${(s.originalTitle ?? "").slice(0, 30)}`]));
console.log("sections:", result.sections.map((s) => `${s.normalizedKind}:${(s.originalTitle ?? "").slice(0, 25)}`).join(" | "));
const firstRef = result.blocks.findIndex((b) => b.type === "reference" || selected.has(b));
for (const b of result.blocks.slice(Math.max(0, firstRef - 3))) {
  console.log(selected.has(b) ? "*" : " ", b.type.padEnd(10), `p${b.pageStart}`, (title.get(b.sectionId ?? "") ?? "-").padEnd(28), (b.original ?? "").replace(/\s+/g, " ").slice(0, 60));
}
