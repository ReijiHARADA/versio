import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";
const dir = "test-fixtures/real-papers/pending-pdfs";
const f = fs.readdirSync(dir).find((x) => x.startsWith("marketing-is-digital"))!;
const pages = await extractPdfPages(path.join(dir, f));
const r = extractFromPages({ pages, paperId: f, filePath: f, fileHash: f, metadata: { pageCount: pages.length } });
console.log("authors", r.paper.authors);
for (const n of r.canonical.nodes.filter((n) => n.pageStart <= 2).slice(0, 35)) {
  console.log(n.role, JSON.stringify((n.text||"").replace(/\s+/g," ").slice(0,100)));
}
