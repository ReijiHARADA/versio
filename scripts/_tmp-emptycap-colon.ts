import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";

const dir = "test-fixtures/real-papers/pending-pdfs";
const f = fs
  .readdirSync(dir)
  .find((x) => x.startsWith("epmc-a-missing-continental-impact-melt-sheet"))!;
const pages = await extractPdfPages(path.join(dir, f));
const r = extractFromPages({
  pages,
  paperId: f,
  filePath: f,
  fileHash: f,
  metadata: { pageCount: pages.length },
});
const all = r.canonical.nodes;
for (let i = 0; i < all.length; i++) {
  const n = all[i]!;
  if (n.role !== "caption") continue;
  const t = (n.text || "").trim();
  if (!/^Figure\s*\d+\s*:?\s*$/i.test(t)) continue;
  console.log("\n===", t, "idx", i);
  for (let j = Math.max(0, i - 1); j <= Math.min(all.length - 1, i + 2); j++) {
    const m = all[j]!;
    const bb = m.boundingBoxes?.[0];
    console.log(
      j,
      m.role,
      bb && `p${m.pageStart} y=${bb.y.toFixed(1)}`,
      JSON.stringify((m.text || "").replace(/\s+/g, " ").slice(0, 90)),
    );
  }
}
