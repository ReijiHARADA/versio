import fs from "node:fs";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";

const [pdfPath, pagesArg = ""] = process.argv.slice(2);
if (!pdfPath) {
  console.error("Usage: npx tsx scripts/diagnose-caption-boundaries.ts <pdf> [pages,comma-separated]");
  process.exit(1);
}
if (!fs.existsSync(pdfPath)) throw new Error(`PDF not found: ${pdfPath}`);

const requestedPages = new Set(
  pagesArg.split(",").map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0),
);
const pages = await extractPdfPages(pdfPath);
for (const page of pages) {
  if (requestedPages.size > 0 && !requestedPages.has(page.pageNumber)) continue;
  const matches = page.textItems.filter((item) =>
    /^(?:table|tables?|figure|fig\.?|overview|list of published|methods|year|number)/i.test(item.text.trim()),
  );
  if (matches.length === 0) continue;
  console.log(`PAGE ${page.pageNumber}`);
  for (const item of matches) {
    console.log(JSON.stringify({
      text: item.text,
      x: Number(item.x.toFixed(2)),
      y: Number(item.y.toFixed(2)),
      width: Number(item.width.toFixed(2)),
      height: Number(item.height.toFixed(2)),
      fontName: item.fontName,
      fontSize: Number(item.fontSize.toFixed(2)),
    }));
  }
}
