import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";
const dir = "test-fixtures/real-papers/pending-pdfs";
const f = fs.readdirSync(dir).find((x) => x.includes("fatigue-and-occupational-safety"))!;
const pages = await extractPdfPages(path.join(dir, f));
const r = extractFromPages({ pages, paperId: f, filePath: f, fileHash: f, metadata: { pageCount: pages.length } });
console.log("authors", r.paper.authors);
console.log("title", r.paper.title || r.paper.titleOriginal);
for (const n of r.canonical.nodes.filter((n) => /copyright/i.test(n.text || "") || n.role === "heading").slice(0, 20)) {
  console.log(n.role, JSON.stringify((n.text||"").replace(/\s+/g," ").slice(0,90)));
}
