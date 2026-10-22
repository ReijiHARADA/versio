import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";

const dir = "test-fixtures/real-papers/pending-pdfs";
const f = fs.readdirSync(dir).find((x) => x.startsWith("epmc-a-multimodal-dataset-for-socially"))!;
const pages = await extractPdfPages(path.join(dir, f));
const r = extractFromPages({
  pages,
  paperId: f,
  filePath: f,
  fileHash: f,
  metadata: { pageCount: pages.length },
});
console.log("pages", pages.length, "title", r.paper.titleOriginal?.slice(0, 80));
console.log("abstract role count", r.canonical.nodes.filter((n) => n.role === "abstract").length);
console.log("paper.abstract", (r.paper.abstract || "").slice(0, 120));
for (const n of r.canonical.nodes.filter((n) => n.pageStart <= 2).slice(0, 25)) {
  const bb = n.boundingBoxes?.[0];
  console.log(
    n.role,
    bb && `y=${bb.y.toFixed(0)}`,
    JSON.stringify((n.text || "").replace(/\s+/g, " ").slice(0, 80)),
  );
}
