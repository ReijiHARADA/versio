/** Re-apply the current quality gate to saved alternate-model audit output. */
import fs from "node:fs";
import path from "node:path";
import { evaluateJaTranslation, getCascadeQualityReasons, isCascadeQualityAcceptable } from "../src/services/translation/quality";

const root = process.cwd();
const inputs = process.argv.slice(2);
if (inputs.length === 0) throw new Error("Usage: vite-node --script scripts/recompute-selective-cascade-quality.ts <report.json>...");

const reports = inputs.map((input) => {
  const absolute = path.resolve(root, input);
  const report = JSON.parse(fs.readFileSync(absolute, "utf8"));
  const results = report.results.map((row: any) => {
    const translation = row.alternateTranslation ?? row.translation;
    if (!translation) return { ...row, recomputedAccepted: row.accepted, recomputedQuality: row.alternateQuality };
    const quality = evaluateJaTranslation(translation, row.source);
    const cascadeReasons = getCascadeQualityReasons(translation, row.source);
    return {
      ...row,
      recomputedAccepted: isCascadeQualityAcceptable(translation, row.source),
      recomputedQuality: quality,
      recomputedCascadeReasons: cascadeReasons,
    };
  });
  return { input, results };
});

const all = reports.flatMap((report) => report.results);
const output = {
  version: "selective-cascade-quality-recompute-v1",
  createdAt: new Date().toISOString(),
  inputs,
  total: all.length,
  originalAccepted: all.filter((row) => row.accepted).length,
  recomputedAccepted: all.filter((row) => row.recomputedAccepted).length,
  changedToRejected: all.filter((row) => row.accepted && !row.recomputedAccepted).map((row) => row.key),
  reports,
};
const destination = path.resolve(root, "test-data/real-papers/reports/selective-cascade-v805-quality-recompute.json");
fs.writeFileSync(destination, `${JSON.stringify(output, null, 2)}\n`);
console.log(`wrote ${destination} (${output.originalAccepted} -> ${output.recomputedAccepted} accepted; changed=${output.changedToRejected.length})`);
