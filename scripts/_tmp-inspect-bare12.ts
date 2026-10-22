import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";

const f =
  "epmc-disentangling-cation-polyanion-coupling-reveals-which-anion-motion-domin.pdf";
const pages = await extractPdfPages(
  path.join("test-fixtures/real-papers/pending-pdfs", f),
);
const r = extractFromPages({
  pages,
  paperId: f,
  filePath: f,
  fileHash: f,
  metadata: { pageCount: pages.length },
});
const all = r.canonical.nodes;
const bare = all.filter((b) => /^\(\s*\d{1,2}[a-z]?\s*\)$/.test((b.text || "").trim()));
console.log("bareCount", bare.length);
for (const b of all.filter(
  (n) => n.pageStart === 9 && (n.role === "equation" || /\(1[12]\)/.test(n.text || "")),
)) {
  console.log(
    b.role,
    JSON.stringify((b.text || "").replace(/\s+/g, " ").slice(0, 160)),
  );
}
