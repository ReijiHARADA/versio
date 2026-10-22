import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";

const dir = "test-fixtures/real-papers/pending-pdfs";
const files = fs.readdirSync(dir);

async function dump(prefix: string, pred: (t: string, role: string, p: number) => boolean) {
  const f = files.find((x) => x.startsWith(prefix));
  if (!f) return console.log("MISS", prefix);
  const pages = await extractPdfPages(path.join(dir, f));
  const r = extractFromPages({
    pages,
    paperId: f,
    filePath: f,
    fileHash: f,
    metadata: { pageCount: pages.length },
  });
  console.log("\n====", f.slice(0, 60), "authors", r.paper.authors?.slice(0, 4));
  const all = r.canonical.nodes;
  for (let i = 0; i < all.length; i++) {
    const n = all[i]!;
    const t = (n.text || "").replace(/\s+/g, " ").trim();
    if (!pred(t, n.role, n.pageStart)) continue;
    for (let j = Math.max(0, i - 3); j <= Math.min(all.length - 1, i + 2); j++) {
      const m = all[j]!;
      console.log(
        j,
        "p" + m.pageStart,
        m.role,
        JSON.stringify((m.text || "").replace(/\s+/g, " ").slice(0, 110)),
      );
    }
    console.log("---");
  }
}

await dump("epmc-two-layer-hierarchical-mppt", (t) => /∫/.test(t));
await dump("epmc-uncovering-traditional-retail", (t) => t === "(4)");
