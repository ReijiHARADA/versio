import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";

const dir = "test-fixtures/real-papers/pending-pdfs";
const files = fs.readdirSync(dir);
const cases = [
  ["epmc-compositional-neurosymbolic", /^\(38\)$/],
  ["epmc-decentralized-rare-disease", /^\(5\)$/],
  ["epmc-covariance-decomposition", /^\(1\)$/],
  ["epmc-development-and-external-validation-of-the-hch", /^\(3\)$/],
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
  const idx = all.findIndex((b) => re.test((b.text || "").trim()));
  console.log("\n====", f.slice(0, 55), "idx", idx);
  if (idx < 0) continue;
  for (let j = Math.max(0, idx - 3); j <= Math.min(all.length - 1, idx + 2); j++) {
    const n = all[j]!;
    console.log(
      j,
      "p" + n.pageStart,
      n.role,
      JSON.stringify((n.text || "").replace(/\s+/g, " ").slice(0, 100)),
    );
  }
}
