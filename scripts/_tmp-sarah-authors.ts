import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";

const dir = "test-fixtures/real-papers/pending-pdfs";
const f = fs.readdirSync(dir).find((x) => x.includes("exploring-the-status-of-the-human-operator-in-indu"))!;
const pages = await extractPdfPages(path.join(dir, f));
const r = extractFromPages({
  pages,
  paperId: f,
  filePath: f,
  fileHash: f,
  metadata: { pageCount: pages.length },
});
console.log("authors", r.paper.authors);
const nodes = r.canonical.nodes.filter(
  (n) =>
    n.pageStart <= 2 &&
    (n.role === "author" ||
      n.role === "affiliation" ||
      n.role === "title" ||
      n.role === "abstract" ||
      /Sarah|Maggioli|and\b|Liliana|Daniel/i.test(n.text || "")),
);
for (const n of nodes.slice(0, 40)) {
  const bb = n.boundingBoxes?.[0];
  console.log(
    n.role,
    bb && `y=${bb.y.toFixed(1)} x=${bb.x.toFixed(1)}`,
    JSON.stringify((n.text || "").replace(/\s+/g, " ").slice(0, 100)),
  );
}
