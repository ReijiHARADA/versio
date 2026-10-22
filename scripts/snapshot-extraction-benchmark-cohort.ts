/**
 * Explicitly run the existing extraction pipeline for a frozen cohort.
 * Raw PDFs remain gitignored; outputs belong in test-data/.
 */
import fs from "node:fs";
import path from "node:path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf.ts";
import { predictionFromSnapshot } from "../src/evaluation/benchmark/adapters.ts";
import type { ExtractionSnapshot } from "../src/evaluation/schema.ts";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2); const option = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const cohortPath = path.resolve(root, option("--cohort") ?? "test-fixtures/extraction-benchmark/independent-cohort-v1.json");
const outputDir = path.resolve(root, option("--output-dir") ?? "test-data/extraction-evaluation/predictions");
const timeoutMs = Number(option("--timeout-ms") ?? 300_000);
const cohort = JSON.parse(fs.readFileSync(cohortPath, "utf8")) as { documents: Array<{ id: string; pdfPath: string; fileHash: string }> };
const ids = option("--ids")?.split(",").map((value) => value.trim()).filter(Boolean);
if (!ids && !args.includes("--all")) throw new Error("Use --ids id1,id2 for a bounded run, or --all for the frozen cohort.");
const selected = ids ? cohort.documents.filter((item) => ids.includes(item.id)) : cohort.documents;
if (ids && selected.length !== ids.length) throw new Error("One or more --ids values are not in the cohort.");
let interrupted = false; const onInterrupt = () => { interrupted = true; }; process.on("SIGINT", onInterrupt);
const started = Date.now(); const completed: string[] = []; const failures: Array<{ id: string; error: string }> = [];
fs.mkdirSync(outputDir, { recursive: true });
for (const [index, item] of selected.entries()) {
  if (interrupted || Date.now() - started > timeoutMs) break;
  try {
    const file = path.join(root, item.pdfPath);
    if (!fs.existsSync(file)) throw new Error("Local PDF is unavailable.");
    const pages = await extractPdfPages(file);
    const extracted = extractFromPages({ pages, paperId: item.id, filePath: file, fileHash: item.fileHash, metadata: { pageCount: pages.length } });
    const snapshot = { schemaVersion: 1, kind: "paper-reader-extraction-snapshot", createdAt: new Date().toISOString(), parser: { id: "paper-reader", version: "local" }, source: { paperId: item.id, fileName: path.basename(file), fileHash: item.fileHash, pageCount: pages.length }, pages: [], canonical: extracted.canonical, projection: { blocks: extracted.blocks } } as ExtractionSnapshot;
    fs.writeFileSync(path.join(outputDir, `${item.id}.prediction.json`), `${JSON.stringify(predictionFromSnapshot(snapshot), null, 2)}\n`);
    completed.push(item.id); process.stderr.write(`extracted ${index + 1}/${selected.length}: ${item.id}\n`);
  } catch (error) { failures.push({ id: item.id, error: error instanceof Error ? error.message : String(error) }); }
}
process.removeListener("SIGINT", onInterrupt);
const result = { generatedAt: new Date().toISOString(), selected: selected.length, completed, failures, interrupted, timedOut: Date.now() - started > timeoutMs, outputDir };
console.log(JSON.stringify(result, null, 2));
if (failures.length || interrupted || result.timedOut) process.exitCode = 1;
