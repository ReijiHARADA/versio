import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";
const dir = "test-fixtures/real-papers/pending-pdfs";
for (const prefix of ["marketing-impact-of-sensory", "marketing-is-digital-advertising"]) {
  const f = fs.readdirSync(dir).find((x) => x.startsWith(prefix));
  if (!f) { console.log("MISS", prefix); continue; }
  const pages = await extractPdfPages(path.join(dir, f));
  const r = extractFromPages({ pages, paperId: f, filePath: f, fileHash: f, metadata: { pageCount: pages.length } });
  console.log("\n====", f.slice(0,50));
  console.log("title", (r.paper.title || r.paper.titleOriginal || "").slice(0,80));
  console.log("authors", r.paper.authors);
  for (const n of r.canonical.nodes.filter((n) => n.pageStart <= 1).slice(0, 18)) {
    console.log(n.role, JSON.stringify((n.text||"").replace(/\s+/g," ").slice(0,90)));
  }
}
