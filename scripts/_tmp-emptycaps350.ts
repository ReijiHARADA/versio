import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";

const dir = "test-fixtures/real-papers/pending-pdfs";
const files = fs.readdirSync(dir);
const cases: Array<[string, RegExp]> = [
  ["epmc-clinicians-practices", /^Figure\s*2$/i],
  ["epmc-comparative-study-of-ssvep", /^FIGURE\s*3$/i],
  ["epmc-design-an-anthropomorphic", /^FIGURE\s*4$/i],
  ["epmc-development-and-usability-evaluation-of-hope", /^Table\s*4$/i],
  ["epmc-diffusion-tensor-image", /^FIGURE\s*2$/i],
  ["epmc-dissecting-neuronal-circuit", /^FIGURE\s*2$/i],
];

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
  const idxs = all
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => re.test((b.text || "").trim()) && b.role === "caption")
    .map(({ i }) => i);
  console.log("\n====", f.slice(0, 55), "idxs", idxs);
  for (const idx of idxs.slice(0, 2)) {
    for (let j = Math.max(0, idx - 1); j <= Math.min(all.length - 1, idx + 2); j++) {
      const n = all[j]!;
      const bb = n.boundingBoxes?.[0];
      console.log(
        j,
        n.role,
        bb && `p${n.pageStart} y=${bb.y.toFixed(1)} x=${bb.x.toFixed(1)}`,
        JSON.stringify((n.text || "").replace(/\s+/g, " ").slice(0, 100)),
      );
    }
  }
}
