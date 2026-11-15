/** Convert an Evaluation Studio bundle/snapshot into a parser-neutral prediction artifact. */
import fs from "node:fs";
import path from "node:path";
import { predictionFromSnapshot } from "../src/evaluation/benchmark/adapters.ts";
import { isEvaluationBundle, type ExtractionSnapshot } from "../src/evaluation/schema.ts";

const args = process.argv.slice(2); const argument = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const input = argument("--input"); const output = argument("--output");
if (!input || !output) throw new Error("Usage: npm run export:extraction-benchmark-prediction -- --input bundle.evaluation.json --output id.prediction.json");
const value = JSON.parse(fs.readFileSync(input, "utf8"));
const snapshot: ExtractionSnapshot = isEvaluationBundle(value) ? value.snapshot : value;
if (snapshot?.kind !== "versio-extraction-snapshot") throw new Error("Input must be an Evaluation Studio evaluation bundle or extraction snapshot.");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(predictionFromSnapshot(snapshot), null, 2)}\n`);
console.log(JSON.stringify({ output, sourceHash: snapshot.source.fileHash, blocks: snapshot.canonical.nodes.length }, null, 2));
