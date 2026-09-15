import fs from "node:fs";
import path from "node:path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";

const root = process.cwd();
const pdfDir = path.join(root, "test-data/real-papers");
const output: Array<Record<string, unknown>> = [];

for (const filename of fs.readdirSync(pdfDir).filter((name) => name.endsWith(".pdf"))) {
  const pages = await extractPdfPages(path.join(pdfDir, filename));
  for (const page of pages) {
    const usable = page.textItems.filter((item) => item.y >= 48 && item.y <= page.height - 38);
    const bins = Array.from({ length: Math.ceil(page.width / 8) }, () => 0);
    for (const item of usable) {
      const start = Math.max(0, Math.floor(item.x / 8));
      const end = Math.min(bins.length - 1, Math.floor((item.x + item.width) / 8));
      for (let index = start; index <= end; index += 1) bins[index] += 1;
    }
    const central = bins.slice(Math.floor(bins.length * 0.38), Math.ceil(bins.length * 0.62));
    const gaps = central.filter((count) => count === 0).length;
    const left = usable.filter((item) => item.x + item.width <= page.width * 0.49).length;
    const right = usable.filter((item) => item.x >= page.width * 0.51).length;
    if (gaps >= 2 && left >= 8 && right >= 8) {
      output.push({ filename, page: page.pageNumber, itemCount: usable.length, centralGapBins: gaps, leftItems: left, rightItems: right });
    }
  }
}

const reportPath = path.join(root, "test-data/real-papers/reports/column-occupancy-diagnostic.json");
fs.writeFileSync(reportPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), candidates: output }, null, 2)}\n`);
console.log(`wrote ${output.length} candidate pages to ${reportPath}`);
