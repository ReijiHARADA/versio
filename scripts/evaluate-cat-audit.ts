import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateJaTranslation, diagnoseIncompleteSource } from "../src/services/translation/quality";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const input = path.resolve(root, args[args.indexOf("--input") + 1] ?? "test-data/real-papers/reports/cat-translate-3.3b-fallback-v1.json");
const output = path.resolve(root, args[args.indexOf("--output") + 1] ?? input.replace(/\.json$/, "-quality.json"));
const report = JSON.parse(fs.readFileSync(input, "utf8"));
const results = (report.results ?? []).map((row: any) => {
  const source = String(row.source ?? "");
  const translation = String(row.translation ?? "");
  const quality = evaluateJaTranslation(translation, source);
  return {
    key: row.key,
    paperId: row.paperId,
    source,
    translation,
    sourceIntegrityFlags: row.sourceIntegrityFlags ?? [],
    incompleteSource: diagnoseIncompleteSource(source),
    quality,
    acceptedByQualityGate: quality.score >= 0.6 && quality.reasons.length === 0,
  };
});
const clean = results.filter((row: any) => !row.sourceIntegrityFlags.length && !row.incompleteSource.incomplete);
const accepted = clean.filter((row: any) => row.acceptedByQualityGate);
const reasonCounts: Record<string, number> = {};
for (const row of clean) for (const reason of row.quality.reasons) reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
const out = {
  version: "cat-audit-quality-v1",
  sourceReport: path.relative(root, input),
  total: results.length,
  cleanSourceRows: clean.length,
  sourceExcluded: results.length - clean.length,
  qualityAccepted: accepted.length,
  qualityAcceptedRate: clean.length ? accepted.length / clean.length : null,
  reasonCounts,
  results,
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ total: out.total, cleanSourceRows: out.cleanSourceRows, sourceExcluded: out.sourceExcluded, qualityAccepted: out.qualityAccepted, qualityAcceptedRate: out.qualityAcceptedRate, reasonCounts }, null, 2));
