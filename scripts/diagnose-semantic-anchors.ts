/**
 * Audit-only semantic anchor report. It never changes production acceptance.
 * Usage: npx vite-node --script scripts/diagnose-semantic-anchors.ts [report] [output]
 */
import fs from "node:fs";
import path from "node:path";
import { evaluateJaTranslation } from "../src/services/translation/quality";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const input = path.resolve(root, process.argv[2] ?? "test-data/real-papers/reports/translation-audit.json");
const output = path.resolve(root, process.argv[3] ?? "test-data/real-papers/reports/semantic-anchor-diagnostic-v1.json");
const report: any = JSON.parse(fs.readFileSync(input, "utf8"));

function anchors(source: string) {
  const values: Array<{ value: string; kind: string; exact: boolean }> = [];
  for (const m of source.matchAll(/\b[A-Z]{2,}(?:[-–][A-Z0-9]+)*\b/g)) values.push({ value: m[0], kind: "acronym", exact: true });
  for (const m of source.matchAll(/\b\d+(?:\.\d+)?\s*(?:%|mm|cm|kg|mg|Hz|kHz|GHz|mA|W|uW)?\b/g)) values.push({ value: m[0].replace(/\s+/g, " ").trim(), kind: "numeric", exact: true });
  for (const m of source.matchAll(/\[[0-9][0-9,\-–— ]*\]|\b(?:Fig(?:ure)?\.?|Table|Eqn?\.?|Section)\s*\d+[A-Za-z]?/gi)) values.push({ value: m[0], kind: "citation-or-reference", exact: true });
  for (const m of source.matchAll(/\b(?:not|no|never|without|although|however|whereas|because|therefore|thus|if|unless|both|either|neither)\b/gi)) values.push({ value: m[0].toLowerCase(), kind: "relation", exact: false });
  for (const m of source.matchAll(/\b[A-Z][A-Za-z]+(?:\s+(?:of|and|the)\s+)?\s+[A-Z][A-Za-z]+\b/g)) values.push({ value: m[0].trim(), kind: "proper-name", exact: false });
  return values.filter((x) => x.value.length >= 2);
}
const rows = report.papers.flatMap((p: any) => p.rows ?? []).filter((r: any) => r.sourceCategory === "ordinary-body-prose" && !r.readerVisibleFallback && r.translation);
const results = rows.map((r: any) => {
  const source = String(r.source), translation = String(r.translation);
  const a = anchors(source);
  const exact = a.filter((x) => translation.toLowerCase().includes(x.value.toLowerCase()));
  const deterministic = a.filter((x) => x.exact);
  const q = evaluateJaTranslation(translation, source);
  return { key: r.key, paperId: r.paperId, source, translation, anchors: a, exactAnchors: exact, missingDeterministicAnchors: deterministic.filter((x) => !exact.includes(x)), qualityReasons: q.reasons, qualityScore: q.score };
});
const summary = { rows: results.length, withMissingDeterministicAnchor: results.filter((r) => r.missingDeterministicAnchors.length > 0).length, relationReasons: results.filter((r) => r.qualityReasons.some((x) => /relation|negation|comparison|condition/i.test(x))).length };
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify({ version: "semantic-anchor-diagnostic-v1", generatedAt: new Date().toISOString(), input, summary, results }, null, 2) + "\n");
console.log(JSON.stringify({ output, summary }, null, 2));
