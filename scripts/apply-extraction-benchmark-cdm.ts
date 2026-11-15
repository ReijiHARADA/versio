/** Apply official local CDM scores to a parser-neutral prediction artifact. */
import fs from "node:fs";
import path from "node:path";
import type { ExtractionBenchmarkPrediction } from "../src/evaluation/benchmark/schema.ts";

const args = process.argv.slice(2); const option = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const input = option("--prediction"); const cdmInputPath = option("--cdm-input"); const scoresPath = option("--scores"); const output = option("--output");
if (!input || !cdmInputPath || !scoresPath || !output) throw new Error("Usage: npm run apply:extraction-benchmark-cdm -- --prediction prediction.json --cdm-input exported-cdm-input.json --scores cdm-scores.json --output prediction-with-cdm.json");
const prediction = JSON.parse(fs.readFileSync(input, "utf8")) as ExtractionBenchmarkPrediction;
const cdmInput = JSON.parse(fs.readFileSync(cdmInputPath, "utf8")) as { kind?: string; source?: { fileHash?: string }; samples?: Array<{ sampleKey?: string; img_id?: string; gt_idx?: string; pred_idx?: string }> };
if (cdmInput.kind !== "versio-cdm-input" || cdmInput.source?.fileHash !== prediction.source.fileHash || !Array.isArray(cdmInput.samples)) throw new Error("CDM input must be an exported versio-cdm-input for the same prediction source.");
const expectedByPrediction = new Map<string, string>();
for (const sample of cdmInput.samples) {
  if (!sample.sampleKey || !sample.pred_idx || sample.img_id !== prediction.source.fileHash || !sample.gt_idx || expectedByPrediction.has(sample.pred_idx)) throw new Error("CDM input has malformed or duplicate formula samples.");
  expectedByPrediction.set(sample.pred_idx, sample.sampleKey);
}
const predictionFormulaIds = new Set(prediction.formulas?.map((formula) => formula.id) ?? []);
for (const predictionId of expectedByPrediction.keys()) if (!predictionFormulaIds.has(predictionId)) throw new Error(`CDM input references formula ${predictionId} absent from the prediction artifact.`);
const raw = JSON.parse(fs.readFileSync(scoresPath, "utf8")) as { scores?: Array<{ sampleKey?: string; pred_idx?: string; score: number }> } | Record<string, number>;
const rawScores = Array.isArray(raw.scores)
  ? raw.scores.filter((item) => Number.isFinite(item.score)).map((item) => ({ key: item.pred_idx, sampleKey: item.sampleKey, score: item.score }))
  : Object.entries(raw).filter(([, score]) => Number.isFinite(score)).map(([key, score]) => ({ key, score }));
const scoreByPrediction = new Map<string, number>();
for (const score of rawScores) {
  const predictionId = score.key && expectedByPrediction.has(score.key)
    ? score.key
    : score.sampleKey ? [...expectedByPrediction.entries()].find(([, sampleKey]) => sampleKey === score.sampleKey)?.[0] : undefined;
  if (!predictionId || (score.sampleKey && expectedByPrediction.get(predictionId) !== score.sampleKey)) throw new Error("CDM scores contain a formula not present in the exported CDM input.");
  if (scoreByPrediction.has(predictionId)) throw new Error(`CDM scores contain duplicate score for ${predictionId}.`);
  scoreByPrediction.set(predictionId, score.score);
}
const next = { ...prediction, formulas: prediction.formulas?.map((formula) => scoreByPrediction.has(formula.id) ? { ...formula, cdm: scoreByPrediction.get(formula.id)! } : formula) };
fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, `${JSON.stringify(next, null, 2)}\n`);
console.log(JSON.stringify({ output, applied: next.formulas?.filter((formula) => formula.cdm !== undefined).length ?? 0 }, null, 2));
