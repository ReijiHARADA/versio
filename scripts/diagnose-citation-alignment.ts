/** Audit-only citation alignment diagnostics; never changes production routing. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { diagnoseCitationAlignment } from "../src/services/translation/audit/citationAlignment";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const at = (flag: string, fallback: string) => {
  const index = args.indexOf(flag);
  return path.resolve(root, index >= 0 ? args[index + 1] : fallback);
};
const input = at("--input", "test-data/real-papers/reports/cat-source-disjoint-auth-v3.json");
const output = at("--output", input.replace(/\.json$/, "-citation-diagnostic.json"));

const report = JSON.parse(fs.readFileSync(input, "utf8"));
const rows = report.results ?? report.rows ?? [];
const results = rows.map((row: any) => {
  const source = String(row.source ?? "");
  const translation = String(row.translation ?? "");
  return { key: row.key, ...diagnoseCitationAlignment(source, translation) };
});
const payload = { version: "citation-alignment-diagnostic-v2", sourceReport: path.relative(root, input), productionGate: false, rows: results, eligibleCount: results.filter((row: any) => row.eligible).length, sourceExcludedCount: results.filter((row: any) => !row.eligible).length, flaggedCount: results.filter((row: any) => row.flagged).length };
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`);
console.log(JSON.stringify({ rows: results.length, flagged: payload.flaggedCount, output: path.relative(root, output) }, null, 2));
