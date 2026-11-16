/** Per-segment reference flags for one field-gold document (local diagnostics only). */
import fs from "node:fs";
import path from "node:path";
import { parseCitation } from "../src/services/pdfExtraction/crf/citation";
import { loadNodeCrfRuntime } from "../src/services/pdfExtraction/crf/nodeRuntime";
import { referenceLinesFromPages, selectReferenceBlocks } from "../src/services/pdfExtraction/crf/referenceLines";
import { segmentReferenceLines } from "../src/services/pdfExtraction/crf/segmentReferences";
import { referenceZoneLines } from "../src/services/pdfExtraction/crf/referenceZone";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";

const root = path.resolve(import.meta.dirname, "..");
const id = process.argv[process.argv.indexOf("--id") + 1];
await loadNodeCrfRuntime();
const pdf = JSON.parse(fs.readFileSync(path.join(root, "test-data/field-gold", id, "gold.json"), "utf8")).pdfPath as string;
const pages = await extractPdfPages(path.join(root, pdf));
const result = extractFromPages({ pages, paperId: id, filePath: pdf, fileHash: id, metadata: { pageCount: pages.length } });
for (const [i, seg] of segmentReferenceLines(referenceZoneLines(pages) ?? referenceLinesFromPages(pages, selectReferenceBlocks(result.blocks, result.sections))).entries()) {
  const c = parseCitation(seg.text);
  console.log(i, c.rejected ? "R" : "-", c.year ? "Y" : "-", c.authors ? "A" : "-", c.doi ? "D" : "-", seg.text.slice(0, 70));
}
