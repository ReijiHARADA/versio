import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf.ts";

const pdf = "/Users/harada/Desktop/2686612.2686699.pdf";
const pages = await extractPdfPages(pdf);
const result = extractFromPages({
  pages, paperId: "finger", filePath: pdf, fileHash: "finger",
  metadata: { pageCount: pages.length },
});
console.log("paper.title", result.paper.titleOriginal);
for (const n of result.canonical.nodes.filter(n =>
  n.role === "title" || /follows|triggered/i.test(n.text ?? "") || (n.role === "heading" && (n.text??"").length < 40)
).slice(0, 40)) {
  console.log(JSON.stringify({
    role: n.role, page: n.pageStart, conf: n.confidence,
    text: (n.text??"").slice(0, 100),
    ev: n.evidence.map(e=>e.label).slice(0,4),
  }));
}
const blocks = result.blocks.filter(b =>
  /follows|triggered/i.test(b.original??"") || b.type === "heading" && (b.original??"").length < 30
).slice(0, 30);
console.log("--- blocks ---");
for (const b of blocks) console.log(b.type, b.pageStart, (b.original??"").slice(0,80));
