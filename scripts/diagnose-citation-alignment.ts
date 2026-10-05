/** Audit-only citation alignment diagnostics; never changes production routing. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { diagnoseIncompleteSource } from "../src/services/translation/quality";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const at = (flag: string, fallback: string) => {
  const index = args.indexOf(flag);
  return path.resolve(root, index >= 0 ? args[index + 1] : fallback);
};
const input = at("--input", "test-data/real-papers/reports/cat-source-disjoint-auth-v3.json");
const output = at("--output", input.replace(/\.json$/, "-citation-diagnostic.json"));

function citationTokens(text: string): string[] {
  const tokens: string[] = [];
  for (const match of text.matchAll(/\[\s*\d{1,3}(?:\s*[-–—]\s*\d{1,3})?(?:\s*,\s*\d{1,3}(?:\s*[-–—]\s*\d{1,3})?)*\s*\]/g)) {
    tokens.push(...match[0].match(/\d{1,3}(?:\s*[-–—]\s*\d{1,3})?/g)!.map((value) => value.replace(/\s+/g, "")));
  }
  // Inline/superscript references are only considered when adjacent to a
  // word and followed by citation punctuation or a boundary. This avoids
  // treating ordinary measurements and years as citations.
  for (const match of text.matchAll(/(?<=[A-Za-z\p{L}])\s*(\d{1,2})(?=\s*[,;:.、。)）]|$)/gu)) {
    const prefix = text.slice(Math.max(0, (match.index ?? 0) - 12), match.index ?? 0);
    if (/(?:Figure|Fig\.?|Table|Tbl\.?)\s*$/i.test(prefix)) continue;
    tokens.push(match[1]);
  }
  return tokens;
}

const report = JSON.parse(fs.readFileSync(input, "utf8"));
const rows = report.results ?? report.rows ?? [];
const results = rows.map((row: any) => {
  const source = String(row.source ?? "");
  const translation = String(row.translation ?? "");
  const sourceTokens = citationTokens(source);
  const outputTokens = citationTokens(translation);
  const sourceCompleteness = diagnoseIncompleteSource(source);
  const sourceCounts = Object.fromEntries([...new Set(sourceTokens)].map((token) => [token, sourceTokens.filter((item) => item === token).length]));
  const outputCounts = Object.fromEntries([...new Set(outputTokens)].map((token) => [token, outputTokens.filter((item) => item === token).length]));
  const missing = Object.entries(sourceCounts).filter(([token, count]) => (outputCounts[token] ?? 0) < count).map(([token]) => token);
  const eligible = !sourceCompleteness.incomplete;
  return { key: row.key, sourceCitationTokens: sourceTokens, outputCitationTokens: outputTokens, missingCitationOccurrences: missing, sourceCompleteness, eligible, flagged: eligible && missing.length > 0 };
});
const payload = { version: "citation-alignment-diagnostic-v2", sourceReport: path.relative(root, input), productionGate: false, rows: results, eligibleCount: results.filter((row: any) => row.eligible).length, sourceExcludedCount: results.filter((row: any) => !row.eligible).length, flaggedCount: results.filter((row: any) => row.flagged).length };
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`);
console.log(JSON.stringify({ rows: results.length, flagged: payload.flaggedCount, output: path.relative(root, output) }, null, 2));
