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
  if (placements || candidates) console.log(JSON.stringify({ filename, placements, embeddedTextCandidates: candidates }));
}
