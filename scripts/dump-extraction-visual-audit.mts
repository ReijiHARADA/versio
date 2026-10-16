/**
 * Dump first-page / outline extraction for spot visual review of real PDFs.
 * Usage: npx tsx scripts/dump-extraction-visual-audit.mts [--limit=20] [--pending-only]
 */
import fs from "node:fs";
import path from "node:path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf.ts";

const root = path.resolve(".");
const catalog = JSON.parse(
  fs.readFileSync(path.join(root, "test-fixtures/real-papers/catalog.json"), "utf8")
) as { pdfDir: string; papers: Array<{ id: string; filename: string }> };
const pendingDir = path.join(root, "test-fixtures/real-papers/pending-pdfs");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : 24;
const onlyPending = process.argv.includes("--pending-only");
const onlyCatalog = process.argv.includes("--catalog-only");

const jobs: Array<{ id: string; pdfPath: string; source: string }> = [];
if (!onlyPending) {
  for (const paper of catalog.papers) {
    const pdfPath = path.join(root, catalog.pdfDir, paper.filename);
    if (fs.existsSync(pdfPath)) jobs.push({ id: paper.id, pdfPath, source: "catalog" });
  }
}
if (!onlyCatalog && fs.existsSync(pendingDir)) {
  for (const name of fs.readdirSync(pendingDir).filter((n) => n.endsWith(".pdf"))) {
    jobs.push({
      id: name.replace(/\.pdf$/i, ""),
      pdfPath: path.join(pendingDir, name),
      source: "pending",
    });
  }
}

// Prefer a spread of sources; take every Nth when over limit.
const stride = Math.max(1, Math.floor(jobs.length / Math.max(limit, 1)));
const selected = jobs.filter((_, i) => i % stride === 0).slice(0, limit);

const lines: string[] = [
  `# Extraction visual audit`,
  ``,
  `Generated: ${new Date().toISOString()}`,
  `Sampled: ${selected.length} / ${jobs.length}`,
  ``,
];

for (let i = 0; i < selected.length; i++) {
  const job = selected[i]!;
  process.stderr.write(`[audit] ${i + 1}/${selected.length} ${job.id}\n`);
  try {
    const pages = await extractPdfPages(job.pdfPath);
    const result = extractFromPages({
      pages,
      paperId: job.id,
      filePath: job.pdfPath,
      fileHash: job.id,
      metadata: { pageCount: pages.length },
    });
    const nodes = result.canonical.nodes;
    const title = nodes.find((n) => n.role === "title")?.text ?? "(missing)";
    const early = nodes
      .filter((n) => n.pageStart <= 2 && n.text?.trim())
      .slice(0, 28)
      .map((n) => `- p${n.pageStart} **${n.role}**: ${JSON.stringify((n.text ?? "").slice(0, 140))}`);
    const headings = nodes
      .filter((n) => n.role === "heading")
      .slice(0, 16)
      .map((n) => `- p${n.pageStart}: ${JSON.stringify((n.text ?? "").slice(0, 100))}`);
    const captions = nodes
      .filter((n) => n.role === "caption")
      .slice(0, 8)
      .map((n) => `- p${n.pageStart}: ${JSON.stringify((n.text ?? "").slice(0, 100))}`);
    lines.push(`## ${job.source}:${job.id}`);
    lines.push(``);
    lines.push(`- pages: ${pages.length}`);
    lines.push(`- title: ${JSON.stringify(title.slice(0, 200))}`);
    lines.push(`- headings: ${nodes.filter((n) => n.role === "heading").length}`);
    lines.push(`- captions: ${nodes.filter((n) => n.role === "caption").length}`);
    lines.push(`- tables: ${nodes.filter((n) => n.role === "table").length}`);
    lines.push(``);
    lines.push(`### Early nodes (p1–2)`);
    lines.push(...(early.length ? early : ["- (none)"]));
    lines.push(``);
    lines.push(`### Headings (sample)`);
    lines.push(...(headings.length ? headings : ["- (none)"]));
    lines.push(``);
    lines.push(`### Captions (sample)`);
    lines.push(...(captions.length ? captions : ["- (none)"]));
    lines.push(``);
  } catch (error) {
    lines.push(`## ${job.source}:${job.id}`);
    lines.push(``);
    lines.push(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    lines.push(``);
  }
}

const out = path.join(root, "test-data/real-papers/reports/extraction-visual-audit-latest.md");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${lines.join("\n")}\n`);
process.stdout.write(`${out}\n`);
