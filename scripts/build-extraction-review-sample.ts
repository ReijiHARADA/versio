import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { reconstructDocument } from "../src/services/pdfLayout";

type Catalog = { pdfDir: string; papers: Array<{ id: string; filename: string; formatFamily?: string }> };

const root = path.join(fileURLToPath(new URL("..", import.meta.url)));
const catalog = JSON.parse(
  fs.readFileSync(path.join(root, "test-fixtures/real-papers/catalog.json"), "utf8")
) as Catalog;

const rows: Array<Record<string, unknown>> = [];
for (const paper of catalog.papers) {
  const pdfPath = path.join(root, catalog.pdfDir, paper.filename);
  if (!fs.existsSync(pdfPath)) continue;
  const pages = await extractPdfPages(pdfPath);
  const { blocks } = reconstructDocument(pages);
  const candidates = blocks
    .filter((block) => block.text.trim().length > 0)
    .filter((block) => ["heading", "paragraph", "figure_caption", "table_caption"].includes(block.role));
  // Keep the sample small, but always retain structural examples when present.
  const selected = [
    ...candidates.filter((b) => b.role === "heading").slice(0, 2),
    ...candidates.filter((b) => b.role === "paragraph").slice(0, 3),
    ...candidates.filter((b) => b.role === "figure_caption" || b.role === "table_caption"),
  ].filter((block, index, all) => all.indexOf(block) === index).slice(0, 8);
  for (const block of selected) {
    rows.push({
      paperId: paper.id,
      filename: paper.filename,
      formatFamily: paper.formatFamily ?? "unknown",
      page: block.pageStart,
      pageEnd: block.pageEnd,
      role: block.role,
      text: block.text,
      bbox: block.bbox,
      review: { label: "pending", severity: null, primaryCause: null, notes: "Compare with the rendered source PDF." },
    });
  }
}

const output = path.join(root, "test-data/real-papers/reports/extraction-manual-sample-v1.json");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify({ version: "extraction-manual-sample-v1", generatedAt: new Date().toISOString(), rows }, null, 2)}\n`);
console.log(`wrote ${rows.length} review rows to ${output}`);
