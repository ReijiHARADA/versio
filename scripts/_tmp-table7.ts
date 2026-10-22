import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";
const dir = "test-fixtures/real-papers/pending-pdfs";
const f = fs.readdirSync(dir).find((x) => x.includes("eyettention-ii"))!;
const pages = await extractPdfPages(path.join(dir, f));
const r = extractFromPages({ pages, paperId: f, filePath: f, fileHash: f, metadata: { pageCount: pages.length } });
for (const n of r.canonical.nodes.filter((n) => /Table\s*7/i.test(n.text||""))) {
  console.log(n.role, JSON.stringify((n.text||"").replace(/\s+/g," ").slice(0,120)));
}
