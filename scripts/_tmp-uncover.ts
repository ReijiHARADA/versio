import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";
const dir = "test-fixtures/real-papers/pending-pdfs";
const f = fs.readdirSync(dir).find((x) => x.startsWith("epmc-uncovering-traditional"))!;
const pages = await extractPdfPages(path.join(dir, f));
const r = extractFromPages({ pages, paperId: f, filePath: f, fileHash: f, metadata: { pageCount: pages.length } });
const all = r.canonical.nodes;
const idx = all.findIndex((b) => (b.text || "").trim() === "(4)");
for (let j = idx - 2; j <= idx + 2; j++) {
  const n = all[j]!;
  const bb = n.boundingBoxes?.[0];
  console.log(j, n.role, bb && `y=${bb.y.toFixed(1)} x=${bb.x.toFixed(1)} w=${bb.width.toFixed(1)}`, JSON.stringify((n.text||"").replace(/\s+/g," ").slice(0,120)));
}
// test looksLike via merge
import { mergeMathematicalDisplayFragments } from "../src/services/pdfExtraction/resolver/mathFragmentMerge";
const slice = all.slice(idx - 2, idx + 3).map((n) => ({ ...n }));
console.log("merged", mergeMathematicalDisplayFragments(slice).map((n) => [n.role, (n.text||"").slice(0,80)]));
