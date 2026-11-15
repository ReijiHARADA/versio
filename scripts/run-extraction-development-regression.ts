/**
 * Bounded, isolated development regression over pre-existing fixture gold.
 * This is deliberately not a validation or held-out benchmark.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { BaselinePaperReport } from "../src/services/pdfExtraction/benchmark.ts";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const option = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const cohortPath = path.resolve(root, option("--cohort") ?? "test-fixtures/extraction-benchmark/development-regression-v1.json");
const timeoutMs = Number(option("--timeout-ms") ?? 240_000);
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("--timeout-ms must be a positive number.");
const cohort = JSON.parse(fs.readFileSync(cohortPath, "utf8")) as { split?: string; documents?: Array<{ id?: string }> };
if (cohort.split !== "development" || !cohort.documents?.length || cohort.documents.length > 12) throw new Error("Development regression cohort must contain 1–12 development fixture IDs.");
const requestedIds = option("--ids")?.split(",").map((id) => id.trim()).filter(Boolean);
const ids = requestedIds ?? cohort.documents.map((document) => document.id).filter((id): id is string => Boolean(id));
if (!ids.length || ids.some((id) => !cohort.documents?.some((document) => document.id === id))) throw new Error("--ids must name fixture IDs from the development regression cohort.");
const output = path.resolve(root, option("--output") ?? "test-data/real-papers/reports/extraction-development-regression-latest.json");

function runWorker(id: string): Promise<BaselinePaperReport> {
  return new Promise((resolve, reject) => {
    // Never use npx here: a cache miss would make a local regression gate
    // silently depend on registry/network availability.
    const viteNode = path.join(root, "node_modules/.bin/vite-node");
    if (!fs.existsSync(viteNode)) return reject(new Error("Local vite-node is unavailable; install locked project dependencies first."));
    const child = spawn(viteNode, ["--script", "scripts/benchmark-pdf-extraction-worker.ts", id], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = ""; let timedOut = false;
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, timeoutMs);
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error(`timed out after ${timeoutMs}ms`));
      if (code !== 0) return reject(new Error(stderr.trim() || `worker exited ${code ?? signal ?? "unknown"}`));
      // vite/pdfjs diagnostics can be written before the worker's one-line
      // JSON result. The final line that begins an object is the contract.
      const start = stdout.lastIndexOf("\n{");
      const payload = (start >= 0 ? stdout.slice(start + 1) : stdout).trim();
      try { resolve(JSON.parse(payload) as BaselinePaperReport); }
      catch { reject(new Error(`worker returned invalid JSON: ${stdout.slice(0, 200)}`)); }
    });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
  });
}

const reports: BaselinePaperReport[] = [];
const failures: Array<{ id: string; error: string }> = [];
for (const [index, id] of ids.entries()) {
  process.stderr.write(`evaluating ${index + 1}/${ids.length}: ${id}\n`);
  try { reports.push(await runWorker(id)); }
  catch (error) { failures.push({ id, error: error instanceof Error ? error.message : String(error) }); }
}
const numericKeys = ["authorF1", "affiliationF1", "headingRecall", "headingPrecision", "headingHierarchyAccuracy", "readingOrderPair", "figureCaptionRecall", "tableCaptionRecall", "tableRegionRecall", "tableRegionPrecision", "sourceIntegrityRate", "canonicalProvenanceRate"] as const;
const summary = Object.fromEntries(numericKeys.map((key) => {
  const values = reports.map((report) => report[key]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return [key, { aggregation: "macro_document_mean", value: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null, evaluatedDocuments: values.length }];
}));
// These two checks require no annotated labels: every native source token must
// survive reconstruction, and every Canonical node must retain PDF provenance.
const invariantFailures = reports.flatMap((report) => [
  report.sourceIntegrityRate < 1 ? { id: report.id, invariant: "sourceIntegrityRate", value: report.sourceIntegrityRate } : null,
  report.canonicalProvenanceRate < 1 ? { id: report.id, invariant: "canonicalProvenanceRate", value: report.canonicalProvenanceRate } : null,
].filter((item): item is { id: string; invariant: string; value: number } => Boolean(item)));
const result = { schemaVersion: 1, kind: "paper-reader-extraction-development-regression", generatedAt: new Date().toISOString(), cohort: path.relative(root, cohortPath), selection: { requested: ids.length, completed: reports.length, timeoutMs }, summary, failures, invariantFailures, reports };
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ output, selection: result.selection, summary, failures, invariantFailures }, null, 2));
if (failures.length || invariantFailures.length) process.exitCode = 1;
