import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf.ts";
import fs from "fs";
import path from "path";

const dir = "test-fixtures/real-papers/pending-pdfs";
const f = fs.readdirSync(dir).find((x) => x.includes("advanced-security-framework-for-5g"));
if (!f) {
  console.log("missing");
  process.exit(0);
}
const pages = await extractPdfPages(path.join(dir, f));
const r = extractFromPages({
  pages,
  paperId: "u",
  filePath: f,
  fileHash: "u",
  metadata: { pageCount: pages.length },
});
console.log(
  JSON.stringify(
    {
      file: f.slice(0, 80),
      title: r.paper.titleOriginal,
      authors: r.paper.authors.slice(0, 6),
      nAuth: r.paper.authors.length,
      abs: (r.canonical.nodes.find((n) => n.role === "abstract")?.text || "").slice(0, 120),
      heads: r.canonical.nodes
        .filter((n) => n.role === "heading")
        .slice(0, 12)
        .map((n) => (n.text || "").slice(0, 70)),
      page1: r.canonical.nodes
        .filter((n) => (n.pageStart ?? 1) === 1)
        .slice(0, 15)
        .map((n) => ({
          role: n.role,
          t: (n.text || "").replace(/\s+/g, " ").trim().slice(0, 100),
        })),
    },
    null,
    2,
  ),
);
