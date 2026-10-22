import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";

const pages = await extractPdfPages("/Users/harada/Desktop/2302.03792v1.pdf");
const r = extractFromPages({
  pages,
  paperId: "2302",
  filePath: "2302.03792v1.pdf",
  fileHash: "2302",
  metadata: { pageCount: pages.length },
});
const p2 = r.canonical.nodes.filter((n) => n.pageStart === 2);
console.log("p2 nodes", p2.length);
for (const b of p2) {
  const t = (b.text || "").replace(/\s+/g, " ").trim();
  if (
    b.role === "equation" ||
    /\(\s*[1-5]\s*\)/.test(t) ||
    /[∫∑√∂]/.test(t) ||
    /mmse|d\/dγ|marginal/i.test(t)
  ) {
    console.log(b.role, JSON.stringify(t.slice(0, 140)));
  }
}
