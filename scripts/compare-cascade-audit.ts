/** Join a fresh MADLAD audit with a selective-cascade replay by stable row key. */
import fs from "node:fs";
import path from "node:path";

const [freshInput, cascadeInput, outputInput] = process.argv.slice(2);
if (!freshInput || !cascadeInput) {
  throw new Error("Usage: vite-node --script scripts/compare-cascade-audit.ts <fresh.json> <cascade.json> [output.json]");
}
const root = process.cwd();
const fresh = JSON.parse(fs.readFileSync(path.resolve(root, freshInput), "utf8"));
const cascade = JSON.parse(fs.readFileSync(path.resolve(root, cascadeInput), "utf8"));
const rows = fresh.papers.flatMap((paper: any) => paper.rows ?? []);
const byKey = new Map((cascade.results ?? []).map((row: any) => [row.key, row]));
const paired = rows.map((row: any) => {
  const alternate = byKey.get(row.key);
  return {
    key: row.key,
    sourceFallback: Boolean(row.sourceFallback),
    beforeFallback: Boolean(row.readerVisibleFallback),
    cascadeAttempted: Boolean(alternate),
    cascadeAccepted: alternate?.accepted ?? null,
    cascadeReasons: alternate?.alternateQuality?.reasons ?? [],
  };
});
const ordinary = paired.filter((row) => !row.sourceFallback);
const attempted = ordinary.filter((row) => row.cascadeAttempted);
const report = {
  version: "paired-cascade-audit-v1",
  freshInput,
  cascadeInput,
  ordinaryCount: ordinary.length,
  beforeFallback: ordinary.filter((row) => row.beforeFallback).length,
  cascadeAttempted: attempted.length,
  cascadeAccepted: attempted.filter((row) => row.cascadeAccepted).length,
  rows: paired,
};
const output = path.resolve(root, outputInput ?? "test-data/real-papers/reports/paired-cascade-latest.json");
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(`wrote ${output}: ordinary=${report.ordinaryCount}, beforeFallback=${report.beforeFallback}, cascade=${report.cascadeAccepted}/${report.cascadeAttempted}`);
