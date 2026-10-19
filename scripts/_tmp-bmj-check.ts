import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf.ts";
import fs from "fs";
import path from "path";

const dir = "test-fixtures/real-papers/pending-pdfs";
const f = fs.readdirSync(dir).find((x) => x.startsWith("epmc-effect-of-simulation"));
if (!f) throw new Error("missing bmj pdf");
const pages = await extractPdfPages(path.join(dir, f));
const r = extractFromPages({
  pages,
  paperId: "u",
  filePath: f,
  fileHash: "u",
  metadata: { pageCount: pages.length },
});
const headings = r.canonical.nodes
  .filter((n) => n.role === "heading")
  .map((n) => (n.text || "").replace(/\s+/g, " ").trim());
console.log(
  JSON.stringify(
    {
      title: r.paper.titleOriginal,
      authors: r.paper.authors,
      badAuth: r.paper.authors.filter((a) => /THIS STUDY|ABSTRACT|STRENGTHS|Downloaded/i.test(a)),
      chromeHeadings: headings.filter((h) =>
        /Downloaded from|24 September|Protected by copyright|THIS STUDY/i.test(h),
      ),
      headings: headings.slice(0, 20),
      abs: (r.canonical.nodes.find((n) => n.role === "abstract")?.text || "").slice(0, 120),
      page1Roles: r.canonical.nodes
        .filter((n) => (n.pageStart ?? 1) === 1)
        .slice(0, 20)
        .map((n) => ({
          role: n.role,
          t: (n.text || "").replace(/\s+/g, " ").trim().slice(0, 90),
        })),
    },
    null,
    2,
  ),
);
