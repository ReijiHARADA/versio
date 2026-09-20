import { readFile, writeFile } from "node:fs/promises";
import { isPlausibleJaTranslation } from "../src/services/translation/quality";

type AuditRow = {
  key?: string;
  source?: string;
  translation?: string;
  readerVisibleFallback?: boolean;
};
type PaperRows = { paper: { id: string }; rows: AuditRow[] };
type Audit = { papers: PaperRows[] };
type ManualReview = { reviews: Array<{ key: string; severity: number; label: string }> };

const root = new URL("../test-data/real-papers/", import.meta.url);
const inputs = [
  {
    name: "v16-reviewed-accepted",
    audit: new URL("reports/translation-audit-fresh-20260920-v16.json", root),
    review: new URL("reports/semantic-review-fresh-20260920-v16.json", root),
  },
  {
    name: "v19-focused-accepted",
    audit: new URL("reports/translation-audit-v19-focused.json", root),
  },
];

const datasets = [];
for (const input of inputs) {
  const audit = JSON.parse(await readFile(input.audit, "utf8")) as Audit;
  const manual = input.review
    ? JSON.parse(await readFile(input.review, "utf8")) as ManualReview
    : undefined;
  const labels = new Map(manual?.reviews.map((row) => [row.key, row]) ?? []);
  const rows = audit.papers.flatMap((paper) => paper.rows
    .filter((row) => !row.readerVisibleFallback && row.source && row.translation)
    .map((row) => {
      const source = row.source!;
      const translation = row.translation!;
      const review = labels.get(row.key ?? "");
      return {
        key: row.key,
        paperId: paper.paper.id,
        sourceLength: source.trim().length,
        translationLength: translation.trim().length,
        lengthRatio: translation.trim().length / Math.max(source.trim().length, 1),
        gateReject: !isPlausibleJaTranslation(translation, source),
        newExtremeCompressionSignal: source.trim().length >= 80
          && translation.trim().length / Math.max(source.trim().length, 1) < 0.2,
        manualSeverity: review?.severity,
        manualLabel: review?.label,
      };
    }));
  const reviewed = rows.filter((row) => row.manualSeverity !== undefined);
  datasets.push({
    name: input.name,
    acceptedTranslationRows: rows.length,
    rowsWithExtremeCompressionSignal: rows.filter((row) => row.newExtremeCompressionSignal).length,
    signalKeys: rows.filter((row) => row.newExtremeCompressionSignal).map((row) => row.key),
    manuallyReviewedRows: reviewed.length,
    reviewedSevereSignals: reviewed.filter((row) => row.newExtremeCompressionSignal && (row.manualSeverity ?? 0) >= 2).length,
    reviewedMinorOrCorrectSignals: reviewed.filter((row) => row.newExtremeCompressionSignal && (row.manualSeverity ?? 0) < 2).length,
    rows,
  });
}

const output = {
  generatedAt: new Date().toISOString(),
  method: "character-length ratio; extreme signal when source >=80 chars and Japanese output/source ratio <0.20; report includes current combined plausibility decision",
  datasets,
};
const target = new URL("reports/extreme-compression-gate-v20.json", root);
await writeFile(target, `${JSON.stringify(output, null, 2)}\n`);
console.log(`wrote ${target.pathname}`);
for (const dataset of datasets) {
  console.log(`${dataset.name}: ${dataset.acceptedTranslationRows} accepts; ${dataset.rowsWithExtremeCompressionSignal} compression signals; ${dataset.manuallyReviewedRows} manually reviewed; ${dataset.reviewedSevereSignals} severe, ${dataset.reviewedMinorOrCorrectSignals} minor/correct signals`);
}
