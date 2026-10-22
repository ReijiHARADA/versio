import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";
const dir = "test-fixtures/real-papers/pending-pdfs";
const f = fs.readdirSync(dir).find((x) => x.startsWith("epmc-coropinn"))!;
const pages = await extractPdfPages(path.join(dir, f));
const r = extractFromPages({ pages, paperId: f, filePath: f, fileHash: f, metadata: { pageCount: pages.length } });
for (const b of r.canonical.nodes.filter((n) => n.pageStart === 6 && (n.role === "equation" || /∥|Di\s*=/.test(n.text || "")))) {
  console.log(b.role, JSON.stringify((b.text || "").replace(/\s+/g, " ").slice(0, 120)));
}
