import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";
const dir = "test-fixtures/real-papers/pending-pdfs";
const f = fs.readdirSync(dir).find((x) => x.startsWith("marketing-is-digital"))!;
const pages = await extractPdfPages(path.join(dir, f));
const r = extractFromPages({ pages, paperId: f, filePath: f, fileHash: f, metadata: { pageCount: pages.length } });
for (const n of r.canonical.nodes.slice(0, 25)) {
  const t = (n.text || "").replace(/\s+/g, " ").trim();
  if (/doctor|philosophy|Irene|thesis|Marketing|2020|partial/i.test(t) || n.role === "heading" || n.role === "title") {
    console.log("p"+n.pageStart, n.role, JSON.stringify(t.slice(0, 90)));
  }
}
