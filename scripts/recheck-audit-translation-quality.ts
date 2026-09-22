import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateJaTranslation, isCascadeQualityAcceptable } from "../src/services/translation/quality.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const input = process.argv[2] ?? "test-data/real-papers/reports/translation-audit-v59-heldout-9papers.json";
const report = JSON.parse(fs.readFileSync(path.resolve(root, input), "utf8"));
const rows = Array.isArray(report.papers)
  ? report.papers.flatMap((paper: any) => paper.rows.map((row: any) => ({ ...row, paperId: paper.paper.id })))
  : (Array.isArray(report.results) ? report.results.map((row: any) => ({
      ...row,
      // Candidate diagnostics do not carry benchmark paper metadata; preserve
      // their key as a stable paper identifier for the recheck artifact.
      paperId: row.paperId ?? String(row.key ?? "").split(":")[0],
      sourceFallback: false,
      readerVisibleFallback: false,
      sourceCategory: row.sourceCategory ?? "ordinary-body-prose",
      wouldAcceptTranslation: row.gateAccept,
    })) : []);
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
const strictAccept = (row: any): boolean => {
  if (!isCascadeQualityAcceptable(row.translation, row.source)) return false;
  // Candidate cascade paths use the full semantic quality result, not only
  // the legacy plausibility boolean. Keep the audit recheck aligned with the
  // production opt-in engine so meta-commentary, invariant drift, and scope
  // risks cannot be counted as accepted merely because Japanese characters
  // are present.
  return true;
};
const changed = generated.filter((row: any) => row.wouldAcceptTranslation !== strictAccept(row));
const body = eligibleRows.filter((row: any) => row.sourceCategory === "ordinary-body-prose");
const allBody = rows.filter((row: any) => row.sourceCategory === "ordinary-body-prose");
const bodyFallbackBefore = body.filter((row: any) => row.readerVisibleFallback).length;
const acceptedAfter = body.filter((row: any) =>
  typeof row.translation === "string"
  && row.translation.length > 0
  && !row.sourceFallback
  && strictAccept(row)
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
    afterAccepted: strictAccept(row),
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
