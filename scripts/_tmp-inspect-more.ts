import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";
const dir = "test-fixtures/real-papers/pending-pdfs";
const files = fs.readdirSync(dir);
async function around(prefix: string, needle: RegExp) {
  const f = files.find((x) => x.startsWith(prefix));
  if (!f) return console.log("MISS", prefix);
  const pages = await extractPdfPages(path.join(dir, f));
  const r = extractFromPages({ pages, paperId: f, filePath: f, fileHash: f, metadata: { pageCount: pages.length } });
  console.log("====", f.slice(0, 60));
  const all = r.canonical.nodes;
  for (let i = 0; i < all.length; i++) {
    const t = (all[i]!.text || "").trim();
    if (!needle.test(t) && all[i]!.role !== "equation") continue;
    if (!needle.test(t) && all[i]!.role === "equation" && !/[≥≤=]/.test(t)) continue;
    if (needle.test(t) || (all[i]!.role === "equation" && t.length <= 12)) {
      for (let j = Math.max(0, i - 3); j <= Math.min(all.length - 1, i + 2); j++) {
        const n = all[j]!;
        console.log(j, "p"+n.pageStart, n.role, JSON.stringify((n.text||"").replace(/\s+/g," ").slice(0,100)));
      }
      console.log("---");
    }
  }
}
await around("epmc-learning-faults", /^\(17\)$/);
await around("epmc-interpretable-machine-learning-for-endometriosi", /[≥≤]/);
