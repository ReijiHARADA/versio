import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateJaTranslation, isPlausibleJaTranslation } from "../src/services/translation/quality.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const input = process.argv[2] ?? "test-data/real-papers/reports/translation-audit-v59-heldout-9papers.json";
const report = JSON.parse(fs.readFileSync(path.resolve(root, input), "utf8"));
const rows = report.papers.flatMap((paper: any) => paper.rows.map((row: any) => ({ ...row, paperId: paper.paper.id })));
// Manual-review exports sometimes contain short, editorial excerpts ending in
// an ellipsis. Comparing those snippets against full-translation invariants
// invents false missing/unexpected facts (e.g. a citation year present only in
// the omitted tail). Keep them visible in the report, but do not score them.
const excerptReason = (row: any): string | undefined => {
  const fields = [row.source, row.translation].filter((value) => typeof value === "string");
  return fields.some((value) => /(?:…|\.\.\.)\s*[”’"')\]]*\s*$/.test(value.trim()))
    ? "trailing ellipsis indicates an incomplete excerpt"
    : undefined;
};
const incomplete = rows.filter((row: any) => excerptReason(row));
const eligibleRows = rows.filter((row: any) => !excerptReason(row));
const generated = eligibleRows.filter((row: any) => typeof row.translation === "string" && row.translation.length > 0);
const changed = generated.filter((row: any) => row.wouldAcceptTranslation !== isPlausibleJaTranslation(row.translation, row.source));
const body = eligibleRows.filter((row: any) => row.sourceCategory === "ordinary-body-prose");
const allBody = rows.filter((row: any) => row.sourceCategory === "ordinary-body-prose");
const bodyFallbackBefore = body.filter((row: any) => row.readerVisibleFallback).length;
const acceptedAfter = body.filter((row: any) =>
  typeof row.translation === "string"
  && row.translation.length > 0
  && !row.sourceFallback
  && isPlausibleJaTranslation(row.translation, row.source)
).length;
const bodyFallbackAfter = body.length - acceptedAfter;
const result = {
  version: "audit-quality-recheck-v2",
  input,
  runId: report.runId,
  excludedIncompleteExcerpts: incomplete.map((row: any) => ({ key: row.key, reason: excerptReason(row) })),
  excludedIncompleteCount: incomplete.length,
  generatedRows: generated.length,
  decisionChanges: changed.map((row: any) => ({
    key: row.key,
    sourceCategory: row.sourceCategory,
    beforeAccepted: row.wouldAcceptTranslation,
    afterAccepted: isPlausibleJaTranslation(row.translation, row.source),
    beforeReasons: row.quality?.reasons ?? [],
    after: evaluateJaTranslation(row.translation, row.source),
  })),
  ordinaryBody: {
    sampled: allBody.length,
    eligibleCompleteSourceRows: body.length,
    excludedIncompleteExcerptRows: allBody.length - body.length,
    visibleFallbackBefore: bodyFallbackBefore,
    visibleFallbackAfter: bodyFallbackAfter,
    acceptedAfter,
    fallbackRateAfter: body.length ? bodyFallbackAfter / body.length : null,
  },
};
const inputBase = path.basename(input, path.extname(input));
const output = path.resolve(root, `test-data/real-papers/reports/${inputBase}-quality-recheck.json`);
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ output, ...result }, null, 2));
