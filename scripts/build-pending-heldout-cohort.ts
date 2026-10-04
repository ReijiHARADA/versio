/**
 * Build a source-only held-out cohort from PDFs that are not in the audited
 * catalog. This does not translate or change production data. It exists so a
 * fresh model comparison cannot accidentally reuse a previously exposed row.
 *
 *   npx vite-node scripts/build-pending-heldout-cohort.ts --limit 30
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";
import { diagnoseIncompleteSource, isExpectedNonProseParagraph } from "../src/services/translation/quality";

const root = path.resolve(import.meta.dirname, "..");
const inputDir = path.join(root, "test-fixtures/real-papers/pending-pdfs");
const output = path.join(root, "test-data/real-papers/reports/pending-heldout-cohort-v1.json");
const limitIndex = process.argv.indexOf("--limit");
const limit = limitIndex >= 0 ? Number(process.argv[limitIndex + 1]) : 30;
const hash = (value: string) => crypto.createHash("sha256").update(value.replace(/\s+/g, " ").trim()).digest("hex");

const files = fs.readdirSync(inputDir).filter((name) => name.toLowerCase().endsWith(".pdf")).sort();
const rows: Array<Record<string, unknown>> = [];
for (const file of files) {
  const filePath = path.join(inputDir, file);
  const pages = await extractPdfPages(filePath);
  const extracted = extractFromPages({
    pages,
    paperId: `pending-${hash(file).slice(0, 12)}`,
    filePath: file,
    fileHash: hash(fs.readFileSync(filePath).toString("base64")),
    metadata: { pageCount: pages.length },
  });
  for (const block of extracted.blocks) {
    const source = String(block.original ?? "").replace(/\s+/g, " ").trim();
    if (block.type !== "paragraph" || source.length < 240 || source.length > 4000) continue;
    if (isExpectedNonProseParagraph(source) || diagnoseIncompleteSource(source).incomplete) continue;
    rows.push({
      key: `${extracted.paper.id}:${block.id}`,
      paperId: extracted.paper.id,
      filename: file,
      pageStart: block.pageStart,
      pageEnd: block.pageEnd,
      sourceHash: hash(source),
      source,
      extractionConfidence: block.extractionConfidence,
    });
  }
}

rows.sort((a, b) => String(a.sourceHash).localeCompare(String(b.sourceHash)));
const selected = rows.slice(0, Math.max(0, limit));
const report = {
  version: "pending-heldout-cohort-v1",
  generatedAt: new Date().toISOString(),
  sourceDirectory: path.relative(root, inputDir),
  selection: "paragraph blocks 240-4000 chars; non-prose and incomplete sources excluded; deterministic source-hash order",
  candidateRows: rows.length,
  selectedRows: selected.length,
  rows: selected,
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(`wrote ${output}: selected=${selected.length}, candidates=${rows.length}`);
