import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const readArg = (name: string, fallback: string) => {
  const index = args.indexOf(name);
  return path.resolve(root, index >= 0 ? args[index + 1] : fallback);
};
const leftPath = readArg("--left", "test-data/real-papers/reports/selective-cascade-v607-30-diagnostics.json");
const rightPath = readArg("--right", "test-data/real-papers/reports/selective-cascade-qwen14-v612-30.json");
const outputPath = readArg("--output", "test-data/real-papers/reports/selective-cascade-model-disagreement.json");
const left = JSON.parse(fs.readFileSync(leftPath, "utf8"));
const right = JSON.parse(fs.readFileSync(rightPath, "utf8"));
const rightByKey = new Map((right.results ?? []).map((row: any) => [row.key, row]));
const rows = (left.results ?? []).flatMap((row: any) => {
  const other = rightByKey.get(row.key);
  if (!other || row.accepted === other.accepted) return [];
  return [{
    key: row.key,
    source: row.source,
    leftAccepted: row.accepted,
    rightAccepted: other.accepted,
    leftReasons: row.alternateQuality?.reasons ?? [],
    rightReasons: other.alternateQuality?.reasons ?? [],
    leftTranslation: row.translation ?? row.alternateTranslation,
    rightTranslation: other.translation ?? other.alternateTranslation,
  }];
});
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify({ version: "model-disagreement-v2", left: path.relative(root, leftPath), right: path.relative(root, rightPath), count: rows.length, rows }, null, 2)}\n`);
console.log(`wrote ${outputPath} (${rows.length} disagreements)`);
