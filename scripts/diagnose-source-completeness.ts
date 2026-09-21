import { readFileSync, writeFileSync } from "node:fs";
import { shouldTranslateParagraph, unsafeParagraphStructureReason } from "../src/services/translation/quality";

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  throw new Error("Usage: vite-node --script scripts/diagnose-source-completeness.ts <manual-review.json> <report.json>");
}
const input = JSON.parse(readFileSync(inputPath, "utf8")) as { reviews: Array<Record<string, unknown>> };
const relevant = input.reviews.filter((row) => ["source_fragment", "correct", "minor_wording"].includes(String(row.reviewLabel)));
const rows = relevant.map((row) => {
  const source = String(row.source ?? "");
  const eligible = shouldTranslateParagraph(source);
  return {
    key: row.key,
    paperId: row.paperId,
    blockId: row.blockId,
    reviewLabel: row.reviewLabel,
    severity: row.severity,
    currentEligible: eligible,
    currentReason: unsafeParagraphStructureReason(source),
    source,
    historicalNotes: row.notes,
  };
});
const positives = rows.filter((row) => row.reviewLabel === "source_fragment");
const controls = rows.filter((row) => row.reviewLabel === "correct" || row.reviewLabel === "minor_wording");
const report = {
  version: "source-completeness-diagnostic-v1",
  input: inputPath,
  interpretation: "Historical development review only; source-fragment capture and clean-control eligibility diagnose the current input gate but are not a population estimate.",
  counts: {
    sourceFragmentCases: positives.length,
    sourceFragmentsBlockedNow: positives.filter((row) => !row.currentEligible).length,
    sourceFragmentsStillEligible: positives.filter((row) => row.currentEligible).length,
    cleanTranslationControls: controls.length,
    cleanControlsEligibleNow: controls.filter((row) => row.currentEligible).length,
    cleanControlsBlockedNow: controls.filter((row) => !row.currentEligible).length,
  },
  rows,
};
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.counts, null, 2));
console.log(`wrote ${outputPath}`);
