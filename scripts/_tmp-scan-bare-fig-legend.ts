import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";

const dir = "test-fixtures/real-papers/pending-pdfs";
const offset = Number(process.env.OFFSET ?? "0");
const limit = Number(process.env.LIMIT ?? "200");
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".pdf"))
  .sort()
  .slice(offset, offset + limit);

const hits: string[] = [];
for (const f of files) {
  try {
    const pages = await extractPdfPages(path.join(dir, f));
    const r = extractFromPages({
      pages,
      paperId: f,
      filePath: f,
      fileHash: f,
      metadata: { pageCount: pages.length },
    });
    const all = r.canonical.nodes;
    for (let i = 0; i < all.length - 1; i++) {
      const c = all[i]!;
      const n = all[i + 1]!;
      const ct = (c.text || "").trim();
      const nt = (n.text || "").trim();
      if (c.role !== "caption" || !/^(?:figure|fig\.?|図)\s*\d+[a-z]?\s*:?\s*$/i.test(ct)) {
        continue;
      }
      if (n.role !== "paragraph" && n.role !== "heading") continue;
      const cb = c.boundingBoxes[0];
      const nb = n.boundingBoxes[0];
      if (!cb || !nb || c.pageStart !== n.pageStart) continue;
      const gap = nb.y - (cb.y + cb.height);
      if (gap < -4 || gap > 56) continue;
      const words = nt.split(/\s+/).filter(Boolean).length;
      if (words < 6) continue;
      // Candidate legend that somehow stayed separate
      hits.push(
        `${f.slice(0, 48)} | ${ct} -> ${n.role} gap=${gap.toFixed(1)} w=${words} | ${nt.slice(0, 70)}`,
      );
      if (hits.length >= 12) break;
    }
  } catch {
    /* skip */
  }
  if (hits.length >= 12) break;
}
console.log(JSON.stringify({ offset, limit, hits }, null, 2));
