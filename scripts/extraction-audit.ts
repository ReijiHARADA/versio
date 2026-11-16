/**
 * Extraction integrity audit on the app's extraction path (local only).
 *
 *   npx vite-node --script scripts/extraction-audit.ts -- --corpus fieldgold [--ids a,b] [--limit N] [--out name]
 *
 * Runs the same steps as extractAcademicPdf (page extraction, extractFromPages,
 * CRF references) for every PDF of a corpus and records each visible text
 * block with the translation-input warning the Reader shows ("段落の末尾が欠けて
 * いる可能性があります…原文を表示しています"). Writes per-document block dumps
 * and a summary under the gitignored test-data/extraction-audit/<out>/.
 *
 * Corpora: fieldgold (CC-licensed field-gold PDFs), realpapers (local
 * test-data/real-papers). Nothing leaves the machine.
 */
import fs from "node:fs";
import path from "node:path";
import { enhanceReferencesWithCrf } from "../src/services/pdfExtraction/crf/applyReferences";
import { loadNodeCrfRuntime } from "../src/services/pdfExtraction/crf/nodeRuntime";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { auditSplit } from "../src/evaluation/extractionAudit/split";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const corpus = arg("corpus") ?? "fieldgold";
const ids = arg("ids")?.split(",");
const limit = Number(arg("limit") ?? Infinity);
const outDir = path.join(root, "test-data/extraction-audit", arg("out") ?? corpus);

type Doc = { id: string; pdf: string; language?: string };

function documents(): Doc[] {
  if (corpus === "fieldgold") {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/field-gold/manifest.json"), "utf8")) as { documents: Array<{ id: string }> };
    return manifest.documents.flatMap((d) => {
      const goldPath = path.join(root, "test-data/field-gold", d.id, "gold.json");
      if (!fs.existsSync(goldPath)) return [];
      const gold = JSON.parse(fs.readFileSync(goldPath, "utf8")) as { pdfPath: string; language: string };
      return [{ id: d.id, pdf: path.join(root, gold.pdfPath), language: gold.language }];
    });
  }
  if (corpus === "realpapers") {
    const dir = path.join(root, "test-data/real-papers");
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".pdf"))
      .sort()
      .map((f) => ({ id: `real-${f.replace(/\.pdf$/, "")}`, pdf: path.join(dir, f) }));
  }
  throw new Error(`unknown corpus ${corpus}`);
}

export type AuditBlock = {
  id: string;
  type: string;
  order: number;
  page: number;
  section: string;
  text: string;
  warning: string | null;
  translatable: boolean;
};

// Text blocks carry the Reader's text; other blocks (figure, table, equation,
// list, code, reference) are kept as context so a paragraph's neighbours are known.
const TEXT_TYPES = new Set(["paragraph", "heading", "footnote"]);

await loadNodeCrfRuntime();
fs.mkdirSync(path.join(outDir, "docs"), { recursive: true });
const docs = documents().filter((d) => !ids || ids.includes(d.id)).slice(0, limit);
const summary: Array<Record<string, unknown>> = [];
for (const [n, doc] of docs.entries()) {
  try {
    const started = performance.now();
    const pages = await extractPdfPages(doc.pdf);
    const result = extractFromPages({ pages, paperId: doc.id, filePath: doc.pdf, fileHash: doc.id, metadata: { pageCount: pages.length } });
    await enhanceReferencesWithCrf(result, pages, loadNodeCrfRuntime);
    const sectionTitle = new Map(result.sections.map((s) => [s.id, `${s.normalizedKind}:${s.originalTitle ?? ""}`]));
    const blocks: AuditBlock[] = result.blocks
      .filter((b) => !TEXT_TYPES.has(b.type) || (b.original ?? "").trim())
      .map((b) => ({
        id: b.id,
        type: b.type,
        order: b.order,
        page: b.pageStart,
        section: sectionTitle.get(b.sectionId ?? "") ?? "",
        text: (b.original ?? "").replace(/\s+/g, " ").trim(),
        warning: typeof b.metadata.translationInputWarning === "string" ? b.metadata.translationInputWarning : null,
        translatable: b.translationStatus !== "skipped",
      }));
    fs.writeFileSync(path.join(outDir, "docs", `${doc.id}.json`), JSON.stringify({ id: doc.id, language: doc.language ?? null, split: auditSplit(doc.id), pages: pages.length, blocks }, null, 1));
    const paragraphs = blocks.filter((b) => b.type === "paragraph");
    summary.push({
      id: doc.id,
      split: auditSplit(doc.id),
      language: doc.language ?? null,
      pages: pages.length,
      paragraphs: paragraphs.length,
      warned: paragraphs.filter((b) => b.warning).length,
      ms: Math.round(performance.now() - started),
    });
    process.stdout.write(`\r${n + 1}/${docs.length}`);
  } catch (error) {
    summary.push({ id: doc.id, error: String((error as Error)?.message ?? error).slice(0, 200) });
  }
}
fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 1));
const ok = summary.filter((s) => !s.error) as Array<{ paragraphs: number; warned: number }>;
const total = ok.reduce((a, s) => a + s.paragraphs, 0);
const warned = ok.reduce((a, s) => a + s.warned, 0);
console.log(`\n${ok.length}/${docs.length} docs, paragraphs ${total}, warned ${warned} (${((100 * warned) / Math.max(1, total)).toFixed(1)}%) → ${path.relative(root, outDir)}`);
