import fs from "node:fs";
import path from "node:path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";

const root = path.resolve("test-data/real-papers");
const files = fs.readdirSync(root).filter((name) => name.endsWith(".pdf"));

function overlapRatio(item: { x: number; y: number; width: number; height: number }, image: { x: number; y: number; width: number; height: number }): number {
  const overlap = Math.max(0, Math.min(item.x + item.width, image.x + image.width) - Math.max(item.x, image.x)) *
    Math.max(0, Math.min(item.y + item.height, image.y + image.height) - Math.max(item.y, image.y));
  return overlap / Math.max(1, item.width * item.height);
}

const report: Array<{ filename: string; placements: number; embeddedTextCandidates: number }> = [];
for (const filename of files) {
  const pages = await extractPdfPages(path.join(root, filename));
  let placements = 0;
  let candidates = 0;
  for (const page of pages) {
    const images = (page.imagePlacements ?? []).filter((image) =>
      image.width >= 100 && image.height >= 50 &&
      !(image.width > page.width * 0.88 && image.height > page.height * 0.88)
    );
    placements += images.length;
    candidates += page.textItems.filter((item) =>
      images.some((image) => overlapRatio(item, image) >= 0.8)
    ).length;
  }
  const row = { filename, placements, embeddedTextCandidates: candidates };
  report.push(row);
  if (placements || candidates) console.log(JSON.stringify(row));
}

const reportPath = path.join(root, "reports", "image-text-overlap-latest.json");
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({ version: "image-text-overlap-v1", generatedAt: new Date().toISOString(), papers: report }, null, 2)}\n`);
