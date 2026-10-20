import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf.ts";
import fs from "fs";
import path from "path";

const dir = "test-fixtures/real-papers/pending-pdfs";
const f = fs.readdirSync(dir).find((x) => x.startsWith("epmc-effect-of-simulation"))!;
const pages = await extractPdfPages(path.join(dir, f));
const page = pages[0]!;
const items = page.textItems
  .map((it) => ({
    t: (it.text || "").replace(/\s+/g, " ").trim(),
    x: Math.round(it.x),
    y: Math.round(it.y),
    w: Math.round(it.width),
    h: Math.round(it.height),
    font: Math.round(it.fontSize),
  }))
  .filter((it) => it.t.length > 0)
  .sort((a, b) => a.y - b.y || a.x - b.x);

console.log("page", page.width, page.height, "items", items.length);

// X histogram for body-ish fonts
const hist = new Map<number, number>();
for (const it of items.filter((i) => i.font <= 12 && i.t.length >= 2)) {
  const bucket = Math.round(it.x / 10) * 10;
  hist.set(bucket, (hist.get(bucket) ?? 0) + 1);
}
console.log("x hist (font<=12):", [...hist.entries()].sort((a, b) => a[0] - b[0]).map(([x, n]) => `${x}:${n}`).join(" "));

console.log("--- first 90 items by Y ---");
for (const it of items.filter((i) => i.t.length >= 2).slice(0, 90)) {
  console.log(`${String(it.y).padStart(4)} x=${String(it.x).padStart(3)} f=${String(it.font).padStart(2)} | ${it.t.slice(0, 95)}`);
}

const r = extractFromPages({
  pages,
  paperId: "u",
  filePath: f,
  fileHash: "u",
  metadata: { pageCount: pages.length },
});
console.log("\n--- paragraph boxes page1 ---");
for (const n of r.canonical.nodes.filter((n) => (n.pageStart ?? 1) === 1 && n.role === "paragraph").slice(0, 15)) {
  const b = n.boundingBoxes?.[0];
  console.log(
    `x=${Math.round(b?.x ?? -1)} y=${Math.round(b?.y ?? -1)} w=${Math.round(b?.width ?? 0)} | ${(n.text || "").replace(/\s+/g, " ").slice(0, 110)}`,
  );
}
