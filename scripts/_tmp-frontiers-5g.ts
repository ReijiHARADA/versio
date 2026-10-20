import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf.ts";
import fs from "fs";
import path from "path";

process.env.PDF_TITLE_DEBUG = "1";
const dir = "test-fixtures/real-papers/pending-pdfs";
const f = fs.readdirSync(dir).find((x) => x.includes("advanced-security-framework-for-5g"))!;
const pages = await extractPdfPages(path.join(dir, f));
const r = extractFromPages({
  pages,
  paperId: "u",
  filePath: f,
  fileHash: "u",
  metadata: { pageCount: pages.length },
});
console.log("RESOLVED", r.paper.titleOriginal);
console.log("AUTHORS", r.paper.authors);
