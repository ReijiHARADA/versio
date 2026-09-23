import fs from "node:fs";
import { extractScientificInvariants, isPlausibleJaTranslation } from "../src/services/translation/quality.ts";

const input = "test-data/real-papers/reports/v342-determinism-probe-v1.json";
const data = JSON.parse(fs.readFileSync(input, "utf8"));
for (const row of data.rows as Array<{ source: string; trials: Array<{ text: string }> }>) {
  const invariants = extractScientificInvariants(row.source).map((item) => item.value);
  for (const trial of row.trials) {
    trial.readerGateAccept = isPlausibleJaTranslation(trial.text, row.source);
    trial.sourceInvariants = invariants;
  }
}
const output = "test-data/real-papers/reports/v342-determinism-probe-v1-evaluated.json";
fs.writeFileSync(output, `${JSON.stringify(data, null, 2)}\n`);
console.log(`wrote ${output}`);
