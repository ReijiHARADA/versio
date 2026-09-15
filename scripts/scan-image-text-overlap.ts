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

const report: Array<{ filename: string; placements: number; embeddedTextCandidates: number; samples: Array<{ page: number; text: string; bbox: { x: number; y: number; width: number; height: number }; image: { id: string; x: number; y: number; width: number; height: number } }> }> = [];
for (const filename of files) {
  const pages = await extractPdfPages(path.join(root, filename));
  let placements = 0;
  let candidates = 0;
  const samples: Array<{ page: number; text: string; bbox: { x: number; y: number; width: number; height: number }; image: { id: string; x: number; y: number; width: number; height: number } }> = [];
  for (const page of pages) {
    const images = (page.imagePlacements ?? []).filter((image) =>
      image.width >= 100 && image.height >= 50 &&
      !((image.width * image.height) / Math.max(1, page.width * page.height) > 0.75) &&
      !(image.width > page.width * 0.88 && image.height > page.height * 0.88)
    );
    placements += images.length;
    for (const item of page.textItems) {
      const image = images.find((candidate) => overlapRatio(item, candidate) >= 0.8);
      if (!image) continue;
      candidates++;
      if (samples.length < 20) samples.push({ page: page.pageNumber, text: item.text, bbox: { x: item.x, y: item.y, width: item.width, height: item.height }, image });
    }
  }
  const row = { filename, placements, embeddedTextCandidates: candidates, samples };
  report.push(row);
  if (placements || candidates) console.log(JSON.stringify(row));
}

const reportPath = path.join(root, "reports", "image-text-overlap-latest.json");
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({ version: "image-text-overlap-v1", generatedAt: new Date().toISOString(), papers: report }, null, 2)}\n`);
