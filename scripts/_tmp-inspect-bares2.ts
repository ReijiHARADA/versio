import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";

const dir = "test-fixtures/real-papers/pending-pdfs";
const files = fs.readdirSync(dir);
const cases = [
  ["epmc-recent-advances-in-deep-learning-for-leukemia", /^\(4\)$/],
  ["epmc-robust-but-independent-sex-differences", /^\(4\)$/],
  ["epmc-sensorless-variable-impedance", /^\(25\)$/],
  ["epmc-st-honet", /^\(\s*2\s*\)$/],
  ["epmc-the-determinants-of-covid", /^\(49\)$/],
] as const;

for (const [prefix, re] of cases) {
  const f = files.find((x) => x.startsWith(prefix));
  if (!f) {
    console.log("MISS", prefix);
    continue;
  }
  const pages = await extractPdfPages(path.join(dir, f));
  const r = extractFromPages({
    pages,
    paperId: f,
    filePath: f,
    fileHash: f,
    metadata: { pageCount: pages.length },
  });
  const all = r.canonical.nodes;
  const idx = all.findIndex((b) => re.test((b.text || "").trim()));
  console.log("\n====", f.slice(0, 56), "idx", idx);
  if (idx < 0) continue;
  for (let j = Math.max(0, idx - 4); j <= Math.min(all.length - 1, idx + 2); j++) {
    const n = all[j]!;
    const bb = n.boundingBoxes?.[0];
    console.log(
      j,
      "p" + n.pageStart,
      n.role,
      bb ? `y=${bb.y.toFixed(0)} x=${bb.x.toFixed(0)}` : "",
      JSON.stringify((n.text || "").replace(/\s+/g, " ").slice(0, 110)),
    );
  }
}
