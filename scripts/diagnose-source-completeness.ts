import { readFileSync, writeFileSync } from "node:fs";
import { shouldTranslateParagraph, unsafeParagraphStructureReason } from "../src/services/translation/quality";

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  throw new Error("Usage: vite-node --script scripts/diagnose-source-completeness.ts <manual-review.json> <report.json>");
}
const input = JSON.parse(readFileSync(inputPath, "utf8")) as {
  reviews?: Array<Record<string, unknown>>;
  archivedReviews?: Array<Record<string, unknown>>;
};
// Manual-review exports keep active and archived rows separately and use the
// durable `labels` array. Accept the older `reviewLabel` shape as well so this
// diagnostic does not silently report zero rows on the current corpus.
const allReviews = [...(input.reviews ?? []), ...(input.archivedReviews ?? [])];
const labelOf = (row: Record<string, unknown>): string | undefined => {
  const labels = Array.isArray(row.labels) ? row.labels.map(String) : [];
  return labels[0] ?? (row.reviewLabel ? String(row.reviewLabel) : undefined);
};
const relevant = allReviews
  .map((row) => ({ row, reviewLabel: labelOf(row) }))
  .filter(({ reviewLabel }) => ["source_fragment", "correct", "minor_wording"].includes(String(reviewLabel)));
const rows = relevant.map((row) => {
  const source = String(row.row.source ?? "");
  const eligible = shouldTranslateParagraph(source);
  return {
    key: row.row.key,
    paperId: row.row.paperId,
    blockId: row.row.blockId,
    reviewLabel: row.reviewLabel,
    severity: row.row.severity,
    currentEligible: eligible,
    currentReason: unsafeParagraphStructureReason(source),
    source,
    historicalNotes: row.row.notes,
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
    sourceFragmentBlockRecall: positives.length > 0
      ? positives.filter((row) => !row.currentEligible).length / positives.length
      : null,
    cleanControlFalseBlockRate: controls.length > 0
      ? controls.filter((row) => !row.currentEligible).length / controls.length
      : null,
  },
  rows,
};
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.counts, null, 2));
console.log(`wrote ${outputPath}`);
