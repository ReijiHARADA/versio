import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf.ts";

const dir = "test-fixtures/real-papers/pending-pdfs";
const f = fs
  .readdirSync(dir)
  .find((x) => x.includes("development-and-psychometric-evaluation-of-the-ai"));
if (!f) throw new Error("missing pdf");
const pages = await extractPdfPages(path.join(dir, f));
const r = extractFromPages({
  pages,
  paperId: f,
  filePath: f,
  fileHash: f,
  metadata: { pageCount: pages.length },
});
const hits = r.canonical.nodes
  .filter((n) => /copyright/i.test(n.text || ""))
  .slice(0, 12);
for (const n of hits) {
  console.log(
    JSON.stringify({
      role: n.role,
      page: n.pageStart,
      text: (n.text || "").slice(0, 120),
    }),
  );
}
