import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";

const dir = "test-fixtures/real-papers/pending-pdfs";
const files = fs.readdirSync(dir).filter((x) => x.endsWith(".pdf"));

async function dump(prefix: string, pred: (t: string, role: string) => boolean) {
  const f = files.find((x) => x.startsWith(prefix));
  if (!f) {
    console.log("MISSING", prefix);
    return;
  }
  const pages = await extractPdfPages(path.join(dir, f));
  const r = extractFromPages({
    pages,
    paperId: f,
    filePath: f,
    fileHash: f,
    metadata: { pageCount: pages.length },
  });
  console.log("\n====", f.slice(0, 64));
  const all = r.canonical.nodes;
  for (let i = 0; i < all.length; i++) {
    const b = all[i]!;
    const t = (b.text || "").replace(/\s+/g, " ").trim();
    if (!pred(t, b.role)) continue;
    for (let j = Math.max(0, i - 3); j <= Math.min(all.length - 1, i + 2); j++) {
      const n = all[j]!;
      const bb = n.boundingBoxes?.[0];
      console.log(
        j,
        "p" + n.pageStart,
        n.role,
        bb ? `y=${bb.y.toFixed(1)} x=${bb.x.toFixed(1)}` : "",
        JSON.stringify((n.text || "").replace(/\s+/g, " ").slice(0, 110)),
      );
    }
    console.log("---");
  }
}

await dump("epmc-coropinn", (t, role) => role === "paragraph" && /\(5\)/.test(t) && /∥|∂/.test(t));
await dump("epmc-atomistic-machine", (t) => t === "(12)");
await dump("epmc-brain-inspired-cognitive", (t) => t === "(1)");
await dump("epmc-large-language-models-in-healthcare", (t) => t === "(3)");
await dump("epmc-design-of-a-soft-robotic", (t) => /^\(\s*2\s*\)$/.test(t));
await dump("epmc-mgem-multigraph", (t, role) => /∑/.test(t) && /\(11\)/.test(t));
