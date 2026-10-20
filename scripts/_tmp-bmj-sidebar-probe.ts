import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { detectPageColumns } from "../src/services/pdfLayout.ts";
import fs from "fs";
import path from "path";

const dir = "test-fixtures/real-papers/pending-pdfs";
const f = fs.readdirSync(dir).find((x) => x.startsWith("epmc-effect-of-simulation"))!;
const pages = await extractPdfPages(path.join(dir, f));
const page = pages[0]!;
const layout = detectPageColumns(page);
console.log(layout);

// Mimic assignColumn roughly
function assignColumn(item: { x: number; width: number }, layout: { isMultiColumn: boolean; gutterX: number; leftX: number; pageWidth: number }) {
  if (!layout.isMultiColumn) return "single";
  if (item.x + item.width < layout.gutterX - 8) return "left";
  if (item.x >= layout.gutterX - 8) return "right";
  return "spanning";
}

const leftItems = page.textItems.filter((it) => assignColumn(it, layout) === "left" && it.text.trim());
const fontBase = median(leftItems.map((i) => i.fontSize)) || 10;
console.log("leftItems", leftItems.length, "fontBase", fontBase);
console.log(
  "near y387",
  leftItems
    .filter((i) => Math.abs(i.y - 387) < 5)
    .map((i) => ({ t: i.text, x: Math.round(i.x), f: +i.fontSize.toFixed(2), w: Math.round(i.width) })),
);

function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

const bodyItems = leftItems.filter((i) => i.fontSize >= fontBase * 0.82);
const superItems = leftItems.filter((i) => i.fontSize < fontBase * 0.82);
console.log("body", bodyItems.length, "super", superItems.length);
console.log(
  "super near abstract",
  superItems
    .filter((i) => i.y > 300 && i.y < 500)
    .map((i) => ({ t: i.text.slice(0, 40), x: Math.round(i.x), y: Math.round(i.y), f: +i.fontSize.toFixed(2) })),
);
