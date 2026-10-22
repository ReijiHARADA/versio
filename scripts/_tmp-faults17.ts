import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";
const dir = "test-fixtures/real-papers/pending-pdfs";
const f = fs.readdirSync(dir).find((x) => x.startsWith("epmc-learning-faults"))!;
const pages = await extractPdfPages(path.join(dir, f));
const r = extractFromPages({ pages, paperId: f, filePath: f, fileHash: f, metadata: { pageCount: pages.length } });
const all = r.canonical.nodes;
const idx = all.findIndex((b) => (b.text || "").trim() === "(17)");
console.log("idx", idx);
if (idx >= 0) {
  for (let j = Math.max(0, idx - 5); j <= Math.min(all.length - 1, idx + 3); j++) {
    const n = all[j]!;
    console.log(j, "p"+n.pageStart, n.role, JSON.stringify((n.text||"").replace(/\s+/g," ").slice(0,120)));
  }
}
