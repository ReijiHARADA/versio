import fs from "node:fs";
import path from "node:path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { reconstructDocument } from "../src/services/pdfLayout";

type Row = { page: number; y: number; x: number[]; text: string; lineCount: number };
type Report = { pdf: string; pages: number; bands: Array<{ page: number; caption: string; captionY: number; rows: Row[]; repeatedX: number[] }> };

const input = process.argv[2];
if (!input) throw new Error("Usage: vite-node --script scripts/diagnose-table-geometry.ts <pdf> [output.json]");
const pdfPath = path.resolve(input);
const pages = await extractPdfPages(pdfPath);
const { blocks } = reconstructDocument(pages);
const bands: Report["bands"] = [];
for (const caption of blocks.filter((block) => /^(?:table|tables?|表)\s*\d+/iu.test(block.text.trim()))) {
  const rows = blocks.filter((block) => block.pageStart === caption.pageStart &&
    block !== caption && block.bbox.y > caption.bbox.y && block.bbox.y - caption.bbox.y <= 300 &&
    block.text.trim().length <= 240 && block.lines.length <= 4)
    .map((block) => ({
      page: block.pageStart,
      y: Math.round(block.bbox.y * 10) / 10,
      x: block.lines.flatMap((line) => line.items).map((item) => Math.round(item.x * 10) / 10),
      text: block.text.trim().slice(0, 180),
      lineCount: block.lines.length,
    }));
  const counts = new Map<number, number>();
  for (const row of rows) for (const x of row.x) {
    const bucket = Math.round(x / 12) * 12;
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  bands.push({ page: caption.pageStart, caption: caption.text.trim(), captionY: caption.bbox.y, rows, repeatedX: [...counts.entries()].filter(([, count]) => count >= 3).map(([x]) => x) });
}
const report: Report = { pdf: pdfPath, pages: pages.length, bands };
const output = process.argv[3];
if (output) fs.writeFileSync(path.resolve(output), `${JSON.stringify(report, null, 2)}\n`);
else console.log(JSON.stringify(report, null, 2));
