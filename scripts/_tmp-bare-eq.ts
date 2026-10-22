import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";

const dir = "test-fixtures/real-papers/pending-pdfs";
const cases = [
  ["epmc-atomistic-machine-learning", /^\(\s*12\s*\)$/],
  ["epmc-brain-inspired-cognitive", /^\(\s*1\s*\)$/],
];
const files = fs.readdirSync(dir);

for (const [prefix, re] of cases) {
  const f = files.find((x) => x.startsWith(prefix));
  if (!f) continue;
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
    (n) =>
      (n.role === "paragraph" || n.role === "other") && re.test((n.text || "").trim()),
  );
  console.log("\n====", f.slice(0, 50), "idx", idx);
  if (idx < 0) continue;
  for (let j = Math.max(0, idx - 2); j <= Math.min(all.length - 1, idx + 2); j++) {
    const n = all[j]!;
    const bb = n.boundingBoxes?.[0];
    console.log(
      j,
      n.role,
      bb && `p${n.pageStart} y=${bb.y.toFixed(1)} x=${bb.x.toFixed(1)}`,
      JSON.stringify((n.text || "").replace(/\s+/g, " ").slice(0, 90)),
    );
  }
}
