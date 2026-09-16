import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const catalog = JSON.parse(readFileSync(join(root, "test-fixtures/real-papers/catalog.json"), "utf8"));
const pending = JSON.parse(readFileSync(join(root, "test-fixtures/real-papers/pending-oa-candidates.json"), "utf8"));
const catalogIds = new Set(catalog.papers.map((paper) => paper.id));
const seen = new Set();
const rows = pending.candidates.map((candidate) => {
  const issues = [];
  if (catalogIds.has(candidate.id)) issues.push("already-in-catalog");
  if (seen.has(candidate.id)) issues.push("duplicate-pending-id");
  seen.add(candidate.id);
  for (const key of ["id", "title", "discipline", "venue", "sourceUrl", "oaStatus", "reasonSelected"]) {
    if (!candidate[key]) issues.push(`missing-${key}`);
  }
  if (candidate.doi && !/^10\.\d{4,9}\//.test(candidate.doi)) issues.push("invalid-doi-shape");
  return { id: candidate.id, title: candidate.title, issues, readyForAcquisition: issues.length === 0 };
});
const report = {
  generatedAt: new Date().toISOString(),
  pending: rows.length,
  readyForAcquisition: rows.filter((row) => row.readyForAcquisition).length,
  blocked: rows.filter((row) => !row.readyForAcquisition).length,
  rows,
};
console.log(JSON.stringify(report, null, 2));
const outputFlag = process.argv.find((arg) => arg.startsWith("--json-out="));
if (outputFlag) {
  const outputPath = outputFlag.slice("--json-out=".length);
  const { writeFileSync } = await import("node:fs");
  writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
}
