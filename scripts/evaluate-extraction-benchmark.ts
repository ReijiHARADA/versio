/**
 * Scores parser-neutral prediction artifacts against reviewed benchmark gold.
 * It never invokes extraction, so a run is reproducible from its inputs.
 *
 * npx tsx scripts/evaluate-extraction-benchmark.ts --gold-dir path --prediction-dir path --split heldout --all
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertNoLeakage, evaluateBenchmarkDocument, type BenchmarkDocumentReport } from "../src/evaluation/benchmark/evaluate.ts";
import type { ExtractionBenchmarkGold, ExtractionBenchmarkPrediction } from "../src/evaluation/benchmark/schema.ts";
import { validateBenchmarkGold } from "../src/evaluation/benchmark/validate.ts";

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const goldDir = option("--gold-dir"); const predictionDir = option("--prediction-dir");
if (!goldDir || !predictionDir) throw new Error("Usage: npm run eval:extraction-benchmark -- --gold-dir reviewed-gold --prediction-dir snapshots [--split development|validation|heldout] [--all] [--allow-empty] [--timeout-ms 300000] [--fail-on-regression] [--fail-on-critical] [--output report.json]");
const split = option("--split"); const timeoutMs = Number(option("--timeout-ms") ?? 300_000);
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("--timeout-ms must be a positive number.");
let interrupted = false; const onInterrupt = () => { interrupted = true; }; process.on("SIGINT", onInterrupt);
const jsonFiles = (directory: string): string[] => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
  ? jsonFiles(path.join(directory, entry.name)) : entry.name.endsWith(".gold.json") ? [path.join(directory, entry.name)] : []);
// Validate the entire supplied gold directory before narrowing to a split:
// a held-out-only invocation must not conceal a duplicate in validation or
// development that makes the benchmark split assignment invalid.
const allGold = jsonFiles(path.resolve(root, goldDir)).map((file) => JSON.parse(fs.readFileSync(file, "utf8")) as ExtractionBenchmarkGold);
assertNoLeakage(allGold);
const gold = allGold.filter((item) => !split || item.split === split);
if (!gold.length && !args.includes("--allow-empty")) throw new Error(`No reviewed gold documents selected${split ? ` for split ${split}` : ""}. Add --allow-empty only when intentionally auditing an empty selection.`);
const invalidGold = gold.flatMap((item) => validateBenchmarkGold(item).map((issue) => `${item.id}: ${issue}`));
if (invalidGold.length) throw new Error(`Invalid benchmark gold:\n${invalidGold.join("\n")}`);
if (!args.includes("--all") && gold.length > 12) throw new Error("More than 12 reviewed documents selected. Use --all for an explicit full benchmark or select a bounded split.");
const started = Date.now(); const reports: BenchmarkDocumentReport[] = []; const missingPredictions: string[] = [];
for (const [index, item] of gold.entries()) {
  if (interrupted || Date.now() - started > timeoutMs) break;
  const file = path.join(path.resolve(root, predictionDir), `${item.id}.prediction.json`);
  if (!fs.existsSync(file)) { missingPredictions.push(item.id); continue; }
  const prediction = JSON.parse(fs.readFileSync(file, "utf8")) as ExtractionBenchmarkPrediction;
  reports.push(evaluateBenchmarkDocument(item, prediction));
  process.stderr.write(`evaluated ${index + 1}/${gold.length}: ${item.id}\n`);
}
const keys: Array<keyof Pick<BenchmarkDocumentReport, "blockF1" | "textCer" | "textNed" | "readingOrder" | "paragraphBoundaries" | "captionRelations" | "tableTeds" | "formulaNed" | "formulaCdm">> = ["blockF1", "textCer", "textNed", "readingOrder", "paragraphBoundaries", "captionRelations", "tableTeds", "formulaNed", "formulaCdm"];
const requiredMetrics = (option("--require-metrics") ?? "").split(",").filter(Boolean) as Array<(typeof keys)[number]>;
const unknownRequiredMetrics = requiredMetrics.filter((metric) => !keys.includes(metric));
if (unknownRequiredMetrics.length) throw new Error(`Unknown required metrics: ${unknownRequiredMetrics.join(", ")}. Valid metrics: ${keys.join(", ")}`);
const summarize = (input: BenchmarkDocumentReport[]) => Object.fromEntries(keys.map((key) => {
  const values = input.map((report) => report[key]).filter((metric): metric is NonNullable<typeof metric> => metric !== null && metric.value !== null);
  return [key, {
    // Keep each reviewed document equally represented in cohort/category
    // summaries; evaluatedUnits remains alongside it for coverage context.
    aggregation: "macro_document_mean" as const,
    value: values.length ? values.reduce((sum, metric) => sum + (metric.value ?? 0), 0) / values.length : null,
    evaluatedDocuments: values.length,
    evaluatedUnits: values.reduce((sum, metric) => sum + metric.evaluated, 0),
  }];
}));
const summary = summarize(reports);
const missingRequiredMetrics = requiredMetrics.filter((metric) => summary[metric].evaluatedDocuments === 0);
const categoryReports = (["publisher", "discipline", "layout", "language"] as const).flatMap((attribute) => {
  const groups = new Map<string, BenchmarkDocumentReport[]>();
  for (const report of reports) { const value = report.attributes[attribute]; if (value) groups.set(value, [...(groups.get(value) ?? []), report]); }
  return [...groups.entries()].map(([value, grouped]) => ({ attribute, value, documents: grouped.length, metrics: summarize(grouped) }));
});
const comparisonPath = option("--compare");
const previous = comparisonPath ? JSON.parse(fs.readFileSync(comparisonPath, "utf8")) as { reports?: BenchmarkDocumentReport[] } : undefined;
const previousById = new Map((previous?.reports ?? []).map((report) => [report.id, report]));
const lowerIsBetter = new Set(["textCer", "textNed", "readingOrder", "formulaNed"]);
const deltas = comparisonPath ? reports.flatMap((report) => keys.flatMap((key) => {
  const before = previousById.get(report.id); const current = report[key]?.value; const prior = before?.[key]?.value;
  if (current === null || current === undefined || prior === null || prior === undefined || report.sourceHash !== before?.sourceHash) return [];
  const delta = current - prior; const regression = lowerIsBetter.has(key) ? delta > 0 : delta < 0;
  return [{ id: report.id, metric: key, delta, regression }];
})) : [];
const result = { schemaVersion: 1, kind: "paper-reader-extraction-benchmark-report", generatedAt: new Date().toISOString(), elapsedMs: Date.now() - started, selection: { split: split ?? "all", selectedGold: gold.length, completed: reports.length, interrupted, timedOut: Date.now() - started > timeoutMs }, summary, ...(requiredMetrics.length ? { requiredMetrics, missingRequiredMetrics } : {}), categoryReports, missingPredictions, reports, criticalFailures: reports.flatMap((report) => report.criticalFailures.map((failure) => ({ id: report.id, failure }))), ...(comparisonPath ? { comparison: { comparedTo: comparisonPath, matchedDocuments: reports.filter((report) => previousById.has(report.id) && previousById.get(report.id)?.sourceHash === report.sourceHash).length, deltas, regressions: deltas.filter((item) => item.regression) } } : {}) };
const output = option("--output") ?? path.join(root, "test-data/extraction-evaluation", `benchmark-${split ?? "all"}.report.json`);
fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
process.removeListener("SIGINT", onInterrupt);
console.log(JSON.stringify({ output, selection: result.selection, summary, categoryReports, missingPredictions, criticalFailures: result.criticalFailures, ...(comparisonPath ? { comparison: result.comparison } : {}) }, null, 2));
if (interrupted || result.selection.timedOut) process.exitCode = 130;
if (args.includes("--fail-on-regression") && result.comparison?.regressions.length) process.exitCode = 1;
if (args.includes("--fail-on-critical") && result.criticalFailures.length) process.exitCode = 1;
if (missingRequiredMetrics.length) { process.stderr.write(`Required metrics have no evaluated units: ${missingRequiredMetrics.join(", ")}\n`); process.exitCode = 1; }
