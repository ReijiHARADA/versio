import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { reconstructDocument, detectPageColumns } from "../src/services/pdfLayout.ts";
import fs from "fs";
import path from "path";

process.env.PDF_LAYOUT_DEBUG = "1";
const dir = "test-fixtures/real-papers/pending-pdfs";
const f = fs.readdirSync(dir).find((x) => x.startsWith("epmc-effect-of-simulation"))!;
const pages = await extractPdfPages(path.join(dir, f));
console.log("columns", detectPageColumns(pages[0]!));
const doc = reconstructDocument(pages);
const p1 = doc.blocks.filter((b) => b.pageStart === 1);
for (const b of p1.slice(0, 45)) {
  console.log(
    String(b.role).padEnd(14),
    String(b.column ?? "").padEnd(6),
    `x=${Math.round(b.bbox.x)}`.padEnd(8),
    `y=${Math.round(b.bbox.y)}`.padEnd(8),
    `w=${Math.round(b.bbox.width)}`.padEnd(8),
    (b.text || "").replace(/\s+/g, " ").slice(0, 110),
  );
}
console.log("--- scrambled-looking ---");
for (const b of p1) {
  const t = (b.text || "").replace(/\s+/g, " ");
  if (/quasi-\s*of complications|simulation-based human$|Protected by copyright|bmjopen.*providers/i.test(t) ||
      (b.bbox.x < 80 && b.role === "paragraph")) {
    console.log(b.role, `x=${Math.round(b.bbox.x)}`, t.slice(0, 140));
  }
}
