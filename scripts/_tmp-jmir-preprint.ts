import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { reconstructDocument } from "../src/services/pdfLayout.ts";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf.ts";

const dir = "test-fixtures/real-papers/pending-pdfs";
const f = fs.readdirSync(dir).find((x) => x.includes("ai-assisted-clinical-documentation"))!;
const pages = await extractPdfPages(path.join(dir, f));
const { blocks } = reconstructDocument(pages);
console.log("--- blocks p1 ---");
for (const b of blocks.filter((b) => b.pageStart <= 1)) {
  console.log(b.role.padEnd(12), Math.round(b.bbox.y), JSON.stringify(b.text.slice(0, 130)));
}
const r = extractFromPages({
  pages,
  paperId: f,
  filePath: f,
  fileHash: f,
  metadata: { pageCount: pages.length },
});
console.log("--- resolved ---");
console.log("title", r.paper.titleOriginal);
console.log("authors", r.paper.authors);
