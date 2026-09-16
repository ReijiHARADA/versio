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
  // Keep the sample bounded, but ensure every paper contributes at least a
  // dozen section-stratified blocks when the cached extraction has enough
  // material. Structural examples are selected first so ordinary prose does
  // not crowd out captions, lists, or headings.
  const selected = [
    ...candidates.filter((b) => b.role === "heading").slice(0, 4),
    ...candidates.filter((b) => b.role === "figure_caption" || b.role === "table_caption"),
    ...candidates.filter((b) => b.role === "paragraph").slice(0, 12),
  ].filter((block, index, all) => all.indexOf(block) === index).slice(0, 16);
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

const counts = new Map<string, number>();
for (const row of rows) counts.set(String(row.paperId), (counts.get(String(row.paperId)) ?? 0) + 1);
const underSampled = catalog.papers
  .filter((paper) => fs.existsSync(path.join(root, catalog.pdfDir, paper.filename)))
  .filter((paper) => (counts.get(paper.id) ?? 0) < 12)
  .map((paper) => `${paper.id}:${counts.get(paper.id) ?? 0}`);
if (underSampled.length > 0) {
  throw new Error(`extraction review sample requires at least 12 rows per cached paper: ${underSampled.join(", ")}`);
}

const output = path.join(root, "test-data/real-papers/reports/extraction-manual-sample-v1.json");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify({ version: "extraction-manual-sample-v1", generatedAt: new Date().toISOString(), rows }, null, 2)}\n`);
console.log(`wrote ${rows.length} review rows to ${output}`);
