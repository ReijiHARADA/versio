/** Apply official local CDM scores to a parser-neutral prediction artifact. */
import fs from "node:fs";
import path from "node:path";
import type { ExtractionBenchmarkPrediction } from "../src/evaluation/benchmark/schema.ts";

const args = process.argv.slice(2); const option = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const input = option("--prediction"); const scoresPath = option("--scores"); const output = option("--output");
if (!input || !scoresPath || !output) throw new Error("Usage: npm run apply:extraction-benchmark-cdm -- --prediction prediction.json --scores cdm-scores.json --output prediction-with-cdm.json");
const prediction = JSON.parse(fs.readFileSync(input, "utf8")) as ExtractionBenchmarkPrediction;
const raw = JSON.parse(fs.readFileSync(scoresPath, "utf8")) as { scores?: Array<{ pred_idx: string; score: number }> } | Record<string, number>;
const scoreByPrediction = new Map<string, number>(Array.isArray(raw.scores) ? raw.scores.filter((item) => Number.isFinite(item.score)).map((item) => [item.pred_idx, item.score]) : Object.entries(raw).filter(([, score]) => Number.isFinite(score)));
const next = { ...prediction, formulas: prediction.formulas?.map((formula) => scoreByPrediction.has(formula.id) ? { ...formula, cdm: scoreByPrediction.get(formula.id)! } : formula) };
fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, `${JSON.stringify(next, null, 2)}\n`);
console.log(JSON.stringify({ output, applied: next.formulas?.filter((formula) => formula.cdm !== undefined).length ?? 0 }, null, 2));
