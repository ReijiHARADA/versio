import { readFileSync, writeFileSync } from "node:fs";
import { evaluateJaTranslation, isPlausibleJaTranslation } from "../src/services/translation/quality";

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) throw new Error("Usage: score-translation-candidate-report.ts <candidate-json> <scored-json>");
const input = JSON.parse(readFileSync(inputPath, "utf8")) as {
  model: string;
  results: Array<Record<string, any>>;
};
const results = input.results.map((row) => {
  const quality = evaluateJaTranslation(row.translation ?? "", row.source ?? "");
  return {
    ...row,
    quality,
    wouldAccept: isPlausibleJaTranslation(row.translation ?? "", row.source ?? ""),
  };
});
const report = {
  ...input,
  scoredAt: new Date().toISOString(),
  scoring: "Versio current client quality-v6; manual source-to-output review still required",
  candidateAccepts: results.filter((row) => row.wouldAccept).length,
  candidateRejects: results.filter((row) => !row.wouldAccept).length,
  results,
};
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
for (const row of results) {
  console.log(`${row.key} accept=${row.wouldAccept} score=${row.quality.score.toFixed(2)} reasons=${row.quality.reasons.join("; ") || "none"}`);
}
console.log(`wrote ${outputPath}`);
