/** Export IoU-matched formula pairs for a local official CDM evaluator. */
import fs from "node:fs";
import path from "node:path";
import { intersectionOverUnion } from "../src/evaluation/benchmark/standardMetrics.ts";
import type { ExtractionBenchmarkGold, ExtractionBenchmarkPrediction } from "../src/evaluation/benchmark/schema.ts";

const args = process.argv.slice(2); const option = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const goldPath = option("--gold"); const predictionPath = option("--prediction"); const output = option("--output");
if (!goldPath || !predictionPath || !output) throw new Error("Usage: npm run export:extraction-benchmark-cdm -- --gold gold.json --prediction prediction.json --output cdm-input.json");
const gold = JSON.parse(fs.readFileSync(goldPath, "utf8")) as ExtractionBenchmarkGold;
const prediction = JSON.parse(fs.readFileSync(predictionPath, "utf8")) as ExtractionBenchmarkPrediction;
if (gold.source.fileHash !== prediction.source.fileHash || gold.id !== prediction.id) throw new Error("Gold and prediction must identify the same source.");
if (gold.coverage.formulas !== "complete" || !gold.formulas?.length || !prediction.formulas?.length) throw new Error("Complete formula gold and predicted formulas are required.");
const latexGold = gold.formulas.filter((formula) => formula.latex?.trim());
const latexPrediction = prediction.formulas.filter((formula) => formula.latex?.trim());
const used = new Set<string>(); const rows = latexGold.flatMap((reference) => {
  const candidate = latexPrediction.filter((formula) => !used.has(formula.id)).map((formula) => ({ formula, iou: intersectionOverUnion(formula.region, reference.region) })).filter((item) => item.iou >= 0.5).sort((a, b) => b.iou - a.iou)[0];
  if (!candidate) return []; used.add(candidate.formula.id);
  return [{ sampleKey: `${gold.source.fileHash}:${reference.id}:${candidate.formula.id}`, img_id: gold.source.fileHash, gt_idx: reference.id, pred_idx: candidate.formula.id, gt: reference.latex!, pred: candidate.formula.latex! }];
});
fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, `${JSON.stringify({ schemaVersion: 1, kind: "versio-cdm-input", source: gold.source, samples: rows }, null, 2)}\n`);
console.log(JSON.stringify({ output, matchedFormulas: rows.length, unmatchedGold: latexGold.length - rows.length, skippedWithoutLatex: gold.formulas.length - latexGold.length }, null, 2));
