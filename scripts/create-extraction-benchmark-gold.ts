import fs from "node:fs";
import path from "node:path";
import { goldFromCompletedReview } from "../src/evaluation/benchmark/reviewGold.ts";
import { isEvaluationBundle, type EvaluationBundle } from "../src/evaluation/schema.ts";

const args = process.argv.slice(2); const option = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const input = option("--input"); const output = option("--output"); const id = option("--id"); const split = option("--split") as "development" | "validation" | "heldout" | undefined; const leakageGroup = option("--leakage-group");
if (!input || !output || !id || !split || !leakageGroup) throw new Error("Usage: npm run create:extraction-benchmark-gold -- --input bundle.json --output gold.json --id id --split heldout --leakage-group publisher-template");
const bundle = JSON.parse(fs.readFileSync(input, "utf8")) as EvaluationBundle;
if (!isEvaluationBundle(bundle)) throw new Error("Input must be a matching Evaluation Studio bundle.");
const gold = goldFromCompletedReview(bundle, { id, split, leakageGroup, attributes: {} });
fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, `${JSON.stringify(gold, null, 2)}\n`);
console.log(JSON.stringify({ output, annotatedPages: gold.annotatedPages, coverage: gold.coverage, blocks: gold.blocks?.length ?? 0 }, null, 2));
