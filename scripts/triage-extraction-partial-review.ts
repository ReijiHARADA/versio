/**
 * Summarize in-progress human review without converting it to benchmark gold.
 * The output is an extraction-improvement queue, never an accuracy report.
 */
import fs from "node:fs";
import path from "node:path";
import { isEvaluationBundle, type EvaluationBundle } from "../src/evaluation/schema.ts";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const option = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const input = option("--input");
if (!input) throw new Error("Usage: vite-node --script scripts/triage-extraction-partial-review.ts --input bundle.evaluation.json [--output report.json]");
const inputPath = path.resolve(root, input);
const bundle = JSON.parse(fs.readFileSync(inputPath, "utf8")) as EvaluationBundle;
if (!isEvaluationBundle(bundle)) throw new Error("Input is not an Evaluation Studio bundle.");
const severityWeight = { critical: 3, major: 2, minor: 1 } as const;
const increment = (counts: Record<string, number>, key: string) => { counts[key] = (counts[key] ?? 0) + 1; };

const errorTypes: Record<string, number> = {};
const correctedRoles: Record<string, number> = {};
const extraRoles: Record<string, number> = {};
const missingRoles: Record<string, number> = {};
const severity: Record<string, number> = {};
const pages = bundle.review.pages.map((page) => {
  const incorrect = page.blockReviews.filter((review) => review.verdict === "incorrect");
  for (const review of incorrect) {
    increment(severity, review.severity);
    // A deleted prediction is `extra`, not evidence that its existing role
    // should be changed. Keep that distinctly visible so table/equation
    // deletion does not get misread as a role-correction target.
    if (review.errorTypes.includes("extra")) {
      if (review.correctRole) increment(extraRoles, review.correctRole);
    } else if (review.correctRole) {
      increment(correctedRoles, review.correctRole);
    }
    for (const type of review.errorTypes) increment(errorTypes, type);
  }
  for (const region of page.missingRegions) increment(missingRoles, region.correctRole);
  const weightedErrors = incorrect.reduce((sum, review) => sum + severityWeight[review.severity], 0);
  const priority = weightedErrors + page.missingRegions.length * severityWeight.critical;
  return {
    page: page.page, status: page.status, priority,
    incorrectBlocks: incorrect.length, missingRegions: page.missingRegions.length,
    missingByRole: Object.fromEntries(Object.entries(page.missingRegions.reduce<Record<string, number>>((counts, region) => { increment(counts, region.correctRole); return counts; }, {})).sort(([a], [b]) => a.localeCompare(b))),
  };
});
const reviewed = bundle.review.pages.filter((page) => page.status !== "unreviewed");
const result = {
  schemaVersion: 1,
  kind: "paper-reader-extraction-partial-review-triage",
  generatedAt: new Date().toISOString(),
  source: bundle.snapshot.source,
  reviewCoverage: { pages: bundle.review.pages.length, touchedPages: reviewed.length, completePages: bundle.review.pages.filter((page) => page.status === "complete").length },
  observations: {
    incorrectBlockReviews: bundle.review.pages.reduce((sum, page) => sum + page.blockReviews.filter((review) => review.verdict === "incorrect").length, 0),
    missingRegions: bundle.review.pages.reduce((sum, page) => sum + page.missingRegions.length, 0),
    errorTypes: Object.fromEntries(Object.entries(errorTypes).sort(([a], [b]) => a.localeCompare(b))),
    severity: Object.fromEntries(Object.entries(severity).sort(([a], [b]) => a.localeCompare(b))),
    correctedRoles: Object.fromEntries(Object.entries(correctedRoles).sort(([a], [b]) => a.localeCompare(b))),
    extraRoles: Object.fromEntries(Object.entries(extraRoles).sort(([a], [b]) => a.localeCompare(b))),
    missingRoles: Object.fromEntries(Object.entries(missingRoles).sort(([a], [b]) => a.localeCompare(b))),
  },
  pages: pages.filter((page) => page.priority > 0).sort((a, b) => b.priority - a.priority || a.page - b.page),
  note: "Partial human observations only. They are not exhaustive ground truth, do not produce precision/recall/F1, and must not be used as training labels.",
};
const output = path.resolve(root, option("--output") ?? "test-data/extraction-evaluation/partial-review-triage.json");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ output, reviewCoverage: result.reviewCoverage, observations: result.observations, topPages: result.pages.slice(0, 8), note: result.note }, null, 2));
