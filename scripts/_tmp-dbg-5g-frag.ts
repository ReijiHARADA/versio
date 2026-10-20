import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf.ts";
import fs from "fs";
import path from "path";

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
const doc = (r as { document?: { nodes?: Array<{ role: string; text?: string }> } }).document;
const nodes = doc?.nodes ?? [];
const interesting = nodes.filter((n) =>
  /LSTM|Instituto|Arvind|Chaudhary|Info-Varcoder|Convolutional|Edited|Shameli|Castelo/i.test(n.text ?? ""),
);
for (const n of interesting.slice(0, 50)) {
  console.log(n.role, JSON.stringify((n.text ?? "").slice(0, 140)));
}
console.log("---TITLE---", r.paper.titleOriginal);
console.log("---AUTHORS---", r.paper.authors);
