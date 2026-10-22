import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";

const dir = "test-fixtures/real-papers/pending-pdfs";
const f = fs.readdirSync(dir).find((x) => x.includes("physiology-based-mathematical"));
if (!f) throw new Error("missing physiology pdf");
const pages = await extractPdfPages(path.join(dir, f));
const r = extractFromPages({
  pages,
  paperId: f,
  filePath: f,
  fileHash: f,
  metadata: { pageCount: pages.length },
});
for (const b of r.canonical.nodes.filter(
  (n) => n.pageStart === 9 && (/\(1[67]\)/.test(n.text || "") || n.role === "equation"),
)) {
  console.log(b.role, JSON.stringify((b.text || "").replace(/\s+/g, " ").slice(0, 140)));
}
