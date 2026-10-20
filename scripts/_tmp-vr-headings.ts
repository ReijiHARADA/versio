import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf.ts";

const f =
  "test-fixtures/real-papers/pending-pdfs/epmc-virtual-reality-for-information-visualization-might-just-work-this-.pdf";
const pages = await extractPdfPages(f);
const r = extractFromPages({
  pages,
  paperId: "vr",
  filePath: f,
  fileHash: "vr",
  metadata: { pageCount: pages.length },
});
console.log("title:", r.paper.titleOriginal ?? r.canonical.nodes.find((n) => n.role === "title")?.text);
console.log("abs?", Boolean((r.paper.abstract || "").trim()));
for (const n of r.canonical.nodes.filter((n) => n.role === "heading").slice(0, 20)) {
  console.log(JSON.stringify({ page: n.pageStart, text: (n.text || "").slice(0, 90) }));
}
console.log("--- chrome-ish nodes ---");
for (const n of r.canonical.nodes.filter((n) =>
  /frontiers|gpixels|robotics and ai|^\d{4}\s/i.test(n.text || ""),
)) {
  console.log(JSON.stringify({ role: n.role, page: n.pageStart, text: (n.text || "").slice(0, 90) }));
}
