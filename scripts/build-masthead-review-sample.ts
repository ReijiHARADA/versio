import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { reconstructDocument } from "../src/services/pdfLayout";

type Catalog = {
  pdfDir: string;
  papers: Array<{ id: string; filename: string; title: string; authors?: string[]; formatFamily?: string }>;
};

const root = path.join(fileURLToPath(new URL("..", import.meta.url)));
const catalog = JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/real-papers/catalog.json"), "utf8")) as Catalog;
const rows = [];
for (const paper of catalog.papers) {
  const pdfPath = path.join(root, catalog.pdfDir, paper.filename);
  if (!fs.existsSync(pdfPath)) continue;
  const pages = await extractPdfPages(pdfPath);
  const { blocks } = reconstructDocument(pages);
  const masthead = blocks
    .filter((block) => block.pageStart === 1 && block.bbox.y < 360 &&
      ["title", "author", "affiliation", "paragraph", "chrome", "copyright"].includes(block.role))
    .slice(0, 24)
    .map((block) => ({ role: block.role, text: block.text, bbox: block.bbox }));
  rows.push({
    paperId: paper.id,
    filename: paper.filename,
    formatFamily: paper.formatFamily ?? "unknown",
    expectedTitle: paper.title,
    expectedAuthors: paper.authors ?? [],
    nativeMasthead: masthead,
    review: { status: "pending", title: null, authors: [], affiliations: [], issues: [] },
  });
}
const output = path.join(root, "test-data/real-papers/reports/masthead-manual-sample-v1.json");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify({ version: "masthead-manual-sample-v1", generatedAt: new Date().toISOString(), rows }, null, 2)}\n`);
console.log(`wrote ${rows.length} masthead review rows to ${output}`);
