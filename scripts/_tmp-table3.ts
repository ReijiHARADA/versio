import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";

const dir = "test-fixtures/real-papers/pending-pdfs";
const f = fs.readdirSync(dir).find((x) => x.startsWith("epmc-multimodal-perception-driven"))!;
const pages = await extractPdfPages(path.join(dir, f));
const r = extractFromPages({
  pages,
  paperId: f,
  filePath: f,
  fileHash: f,
  metadata: { pageCount: pages.length },
});
const all = r.canonical.nodes;
const idx = all.findIndex(
  (n) => n.role === "caption" && /^TABLE\s*3\s*$/i.test((n.text || "").trim()),
);
console.log("idx", idx);
for (let j = Math.max(0, idx - 2); j <= Math.min(all.length - 1, idx + 3); j++) {
  const n = all[j]!;
  const bb = n.boundingBoxes?.[0];
  console.log(
    j,
    n.role,
    bb && `p${n.pageStart} y=${bb.y.toFixed(1)} x=${bb.x.toFixed(1)}`,
    JSON.stringify((n.text || "").replace(/\s+/g, " ").slice(0, 100)),
  );
}
