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
    .filter((block) => ["heading", "paragraph", "figure_caption", "table_caption", "equation"].includes(block.role));
  // Keep the sample bounded, but ensure every paper contributes at least a
  // dozen section-stratified blocks when the cached extraction has enough
  // material. Ordinary prose is kept dominant; structural examples are
  // capped so captions and headings do not crowd out body text.
  const paragraphCandidates = candidates.filter((b) => b.role === "paragraph");
  const suspiciousParagraphs = paragraphCandidates.filter((b) =>
    /(?:^|\s)(?:Abstract|Introduction|Related Work|Methods|Results|Discussion|Conclusions|(?:Fig(?:ure)?|Table)\.?\s*\d{1,3})\b/i.test(b.text)
    && /[.!?]\s+[A-Z]/.test(b.text)
  );
  const selected = [
    // Keep ordinary body text dominant, while reserving two slots for
    // geometry-confirmation candidates where a structural marker is embedded
    // in a paragraph. These are review candidates, never automatic errors.
    ...suspiciousParagraphs.slice(0, 2),
    ...paragraphCandidates.filter((b) => !suspiciousParagraphs.includes(b)).slice(0, 10),
    ...candidates.filter((b) => b.role === "heading").slice(0, 3),
    ...candidates.filter((b) => b.role === "figure_caption").slice(0, 1),
    ...candidates.filter((b) => b.role === "table_caption").slice(0, 1),
    ...candidates.filter((b) => b.role === "equation").slice(0, 1),
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
      diagnosticFlags: [
        block.pageStart !== block.pageEnd ? "cross-page-block" : null,
        block.role === "paragraph" && /(?:^|\s)(?:Abstract|Introduction|Related Work|Methods|Results|Discussion|Conclusions|(?:Fig(?:ure)?|Table)\.?\s*\d{1,3})\b/i.test(block.text) ? "embedded-structural-marker-candidate" : null,
        block.role === "paragraph" && /[.!?]\s+[A-Z]/.test(block.text) ? "internal-sentence-boundary" : null,
      ].filter(Boolean),
      review: { label: "pending", severity: null, primaryCause: null, notes: "Compare with the rendered source PDF; diagnosticFlags are candidate signals only." },
    });
  }
}

const counts = new Map<string, number>();
for (const row of rows) counts.set(String(row.paperId), (counts.get(String(row.paperId)) ?? 0) + 1);
const underSampled = catalog.papers
  .filter((paper) => fs.existsSync(path.join(root, catalog.pdfDir, paper.filename)))
  .filter((paper) => (counts.get(paper.id) ?? 0) < 12)
  .map((paper) => `${paper.id}:${counts.get(paper.id) ?? 0}`);
const output = path.join(root, "test-data/real-papers/reports/extraction-manual-sample-v1.json");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify({
  version: "extraction-manual-sample-v1",
  generatedAt: new Date().toISOString(),
  sampling: {
    targetRowsPerPaper: 12,
    underSampled,
    note: "Short papers retain every available candidate; they are not treated as extraction failures.",
  },
  rows,
}, null, 2)}\n`);
console.log(`wrote ${rows.length} review rows to ${output}`);
