import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/real-papers/catalog.json"), "utf8"));
const ids = process.argv.slice(2);
const papers = ids.length ? catalog.papers.filter((p: { id: string }) => ids.includes(p.id)) : catalog.papers;
for (const paper of papers) {
  const filePath = path.join(root, catalog.pdfDir, paper.filename);
  if (!fs.existsSync(filePath)) continue;
  try {
    const pages = await extractPdfPages(filePath);
    const result = extractFromPages({
      pages,
      paperId: `title-diagnostic-${paper.id}`,
      filePath: paper.filename,
      fileHash: paper.id,
      metadata: { pageCount: pages.length },
    });
    const title = result.canonical.nodes.find((node) => node.role === "title")?.text ?? null;
    console.log(JSON.stringify({ id: paper.id, expected: paper.title, title }));
  } catch (error) {
    console.log(JSON.stringify({ id: paper.id, error: String(error) }));
  }
}
