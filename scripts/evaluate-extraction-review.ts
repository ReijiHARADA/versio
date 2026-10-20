/**
 * Evaluate a human-review bundle exported by PDF Extraction Evaluation Studio.
 * This never runs a parser: snapshots make comparisons reproducible and allow
 * future Docling/GROBID adapters to use the same review labels.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateReview, type EvaluationReport } from "../src/evaluation/metrics.ts";
import { isEvaluationBundle, type EvaluationBundle } from "../src/evaluation/schema.ts";

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");
const args = process.argv.slice(2);
const arg = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const input = arg("--input");
if (!input) throw new Error("Usage: npm run eval:pdf-extraction -- --input bundle.evaluation.json [--compare previous.report.json] [--output report.json]");

const bundle = JSON.parse(fs.readFileSync(input, "utf8")) as EvaluationBundle;
if (!isEvaluationBundle(bundle)) throw new Error("Input is not a valid evaluation bundle (or its review does not match its PDF hash).");
const report = evaluateReview(bundle.snapshot, bundle.review);
const comparisonPath = arg("--compare");
let comparison: unknown;
if (comparisonPath) {
  const previous = JSON.parse(fs.readFileSync(comparisonPath, "utf8")) as EvaluationReport;
  const roleDelta = Object.fromEntries(Object.keys(report.roles).map((role) => {
    const current = report.roles[role]?.f1; const before = previous.roles?.[role]?.f1;
    return [role, current !== null && current !== undefined && before !== null && before !== undefined ? current - before : null];
  }));
  comparison = { comparedTo: comparisonPath, sourceHashMatches: previous.source?.fileHash === report.source.fileHash, roleF1Delta: roleDelta };
}
const result = { ...report, ...(comparison ? { comparison } : {}) };
const output = arg("--output") ?? path.join(root, "test-data/extraction-evaluation", `${bundle.snapshot.source.fileHash.slice(0, 12)}.report.json`);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ output, source: report.source, roles: report.roles, relations: report.relations, notes: report.notes, ...(comparison ? { comparison } : {}) }, null, 2));
