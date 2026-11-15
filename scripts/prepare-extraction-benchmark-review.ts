/** Build local Evaluation Studio bundles from an explicitly selected cohort. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf.ts";
import { newReview, type ExtractionSnapshot } from "../src/evaluation/schema.ts";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2); const option = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const cohort = JSON.parse(fs.readFileSync(path.resolve(root, option("--cohort") ?? "test-fixtures/extraction-benchmark/independent-cohort-v1.json"), "utf8")) as { documents: Array<{ id: string; pdfPath: string; fileHash: string }> };
const id = option("--id"); const all = args.includes("--all"); const timeoutMs = Number(option("--timeout-ms") ?? 300_000);
if ((id ? 1 : 0) + (all ? 1 : 0) !== 1) throw new Error("Usage: npm run prepare:extraction-benchmark-review -- --id cohort-id | --all [--cohort file] [--output-dir directory] [--overwrite]");
const selected = id ? cohort.documents.filter((item) => item.id === id) : cohort.documents;
if (!selected.length) throw new Error("Unknown cohort ID.");
const outputDir = path.resolve(root, option("--output-dir") ?? "test-data/extraction-evaluation/reviews");
const digest = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const overwrite = args.includes("--overwrite");
let interrupted = false; const onInterrupt = () => { interrupted = true; }; process.on("SIGINT", onInterrupt);
const started = Date.now(); const completed: Array<{ id: string; pages: number; canonicalNodes: number }> = []; const failures: Array<{ id: string; error: string }> = [];
fs.mkdirSync(outputDir, { recursive: true });
for (const [index, item] of selected.entries()) {
  if (interrupted || Date.now() - started > timeoutMs) break;
  try {
    const file = path.join(root, item.pdfPath); if (!fs.existsSync(file)) throw new Error("Local PDF is unavailable.");
    if (digest(file) !== item.fileHash) throw new Error("Local PDF hash does not match the frozen cohort manifest.");
    const destination = path.join(outputDir, `${item.id}.evaluation.json`);
    if (fs.existsSync(destination) && !overwrite) throw new Error("Review bundle already exists; refusing to overwrite saved human review. Use --overwrite only when intentionally replacing it.");
    const pages = await extractPdfPages(file);
    const extracted = extractFromPages({ pages, paperId: item.id, filePath: file, fileHash: item.fileHash, metadata: { pageCount: pages.length } });
    const snapshot = { schemaVersion: 1, kind: "versio-extraction-snapshot", createdAt: new Date().toISOString(), parser: { id: "versio", version: "local" }, source: { paperId: item.id, fileName: path.basename(file), fileHash: item.fileHash, pageCount: pages.length }, pages: pages.map((page) => ({ page: page.pageNumber, width: page.width, height: page.height, rotation: page.rotation })), canonical: extracted.canonical, projection: { blocks: extracted.blocks } } as ExtractionSnapshot;
    const bundle = { schemaVersion: 1, kind: "versio-extraction-evaluation", snapshot, review: newReview(snapshot) };
    fs.writeFileSync(destination, `${JSON.stringify(bundle, null, 2)}\n`);
    completed.push({ id: item.id, pages: pages.length, canonicalNodes: extracted.canonical.nodes.length }); process.stderr.write(`prepared ${index + 1}/${selected.length}: ${item.id}\n`);
  } catch (error) { failures.push({ id: item.id, error: error instanceof Error ? error.message : String(error) }); }
}
process.removeListener("SIGINT", onInterrupt);
const result = { selected: selected.length, completed, failures, interrupted, timedOut: Date.now() - started > timeoutMs, outputDir };
console.log(JSON.stringify(result, null, 2)); if (failures.length || interrupted || result.timedOut) process.exitCode = 1;
