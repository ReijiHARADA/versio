import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const catalog = JSON.parse(readFileSync(join(root, "test-fixtures/real-papers/catalog.json"), "utf8"));
const required = ["title", "authors", "year", "discipline", "venue", "publisher", "doi", "sourceUrl", "oaStatus", "formatFamily", "filename", "selectionReason"];
// Lower bounds used by the Phase 2 audit plan. These are deliberately
// reporting thresholds: a partial catalog remains useful while acquisition
// is in progress, but the gap must stay visible in every generated report.
const targetMinimums = {
  hci: 12,
  "cognitive-psychology": 10,
  marketing: 10,
  ergonomics: 10,
  linguistics: 10,
};
const rows = catalog.papers.map((paper) => {
  const missing = required.filter((key) => {
    const value = paper[key];
    return value == null || value === "" || (Array.isArray(value) && value.length === 0);
  });
  return { id: paper.id, pdfReady: existsSync(join(root, catalog.pdfDir, paper.filename)), missing };
});
const formatCounts = Object.fromEntries(Object.entries(Object.groupBy(catalog.papers, (p) => p.formatFamily)).map(([k, v]) => [k, v.length]));
const disciplineCounts = Object.fromEntries(Object.entries(Object.groupBy(catalog.papers, (p) => p.discipline)).map(([k, v]) => [k, v.length]));
const disciplineTargets = Object.fromEntries(Object.entries(targetMinimums).map(([discipline, target]) => {
  const count = disciplineCounts[discipline] ?? 0;
  return [discipline, { target, count, deficit: Math.max(0, target - count) }];
}));
const report = { generatedAt: new Date().toISOString(), papers: catalog.papers.length, pdfReady: rows.filter((r) => r.pdfReady).length, missingMetadata: rows.filter((r) => r.missing.length), formatCounts, disciplineCounts, disciplineTargets, rows };
console.log(JSON.stringify(report, null, 2));
const outputFlag = process.argv.find((arg) => arg.startsWith("--json-out="));
if (outputFlag) writeFileSync(outputFlag.slice("--json-out=".length), JSON.stringify(report, null, 2) + "\n");
