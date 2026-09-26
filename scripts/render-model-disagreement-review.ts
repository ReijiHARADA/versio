import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const input = path.resolve(root, process.argv[process.argv.indexOf("--input") + 1] ?? "test-data/real-papers/reports/selective-cascade-model-disagreement-v614.json");
const output = path.resolve(root, process.argv[process.argv.indexOf("--output") + 1] ?? "test-data/real-papers/reports/selective-cascade-model-disagreement-review.md");
const report = JSON.parse(fs.readFileSync(input, "utf8"));
const lines = [
  "# Selective cascade model disagreement review",
  "",
  "Manual review is required; automatic acceptance is not a gold label.",
  "Use labels: `correct`, `minor_wording`, `terminology_error`, `semantic_shift`, `omission`, `addition`, `hallucination`, `numeric_error`, `citation_error`, `repetition`, `source_fragment`.",
  "",
];
for (const row of report.rows ?? []) {
  lines.push(`## ${row.key}`, "", "### Source", row.source ?? "", "", "### Gemma", `accepted: ${row.leftAccepted}; reasons: ${(row.leftReasons ?? []).join(", ") || "none"}`, row.leftTranslation ?? "", "", "### Qwen", `accepted: ${row.rightAccepted}; reasons: ${(row.rightReasons ?? []).join(", ") || "none"}`, row.rightTranslation ?? "", "", "### Manual review", "- Gemma label:", "- Qwen label:", "- Severity (0–4):", "- Notes:", "");
}
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${lines.join("\n")}\n`);
console.log(`wrote ${output} (${report.rows?.length ?? 0} rows)`);
