#!/usr/bin/env node
/**
 * Build a deterministic, audit-only held-out ordinary-prose cohort.
 * Existing model-comparison/review artifacts are used only to exclude source
 * hashes; no labels or outputs are used for selection.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = path.resolve(import.meta.dirname, "..");
const reportsDir = path.join(root, "test-data/real-papers/reports");
const input = process.argv.includes("--input")
  ? path.resolve(process.argv[process.argv.indexOf("--input") + 1])
  : path.join(reportsDir, "translation-audit.json");
const output = process.argv.includes("--output")
  ? path.resolve(process.argv[process.argv.indexOf("--output") + 1])
  : path.join(reportsDir, "heldout-ordinary-cohort-v1.json");
const limitArg = process.argv.indexOf("--limit");
const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : 30;

const stableHash = (source) => crypto.createHash("sha256").update(source.replace(/\s+/g, " ").trim()).digest("hex");
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } };
const report = readJson(input);
if (!report) throw new Error(`Could not read ${input}`);

const rows = (report.papers ?? []).flatMap((entry) => {
  const paper = entry.paper ?? entry;
  return (entry.rows ?? []).map((row) => ({
    ...row,
    paperId: paper.id ?? paper.paper ?? row.paperId,
    discipline: paper.disciplines?.[0] ?? "unclassified",
    formatFamily: paper.formatFamily ?? "unknown",
  }));
}).filter((row) => row.sourceCategory === "ordinary-body-prose" && typeof row.source === "string" && row.source.trim().length >= 240);

const excluded = new Set();
for (const file of fs.readdirSync(reportsDir)) {
  if (!/\.json$/.test(file) || file === path.basename(input)) continue;
  // Exclude only prior model/review cohorts. Historical extraction/audit
  // reports may contain the same source rows and are not evidence of model
  // exposure, so they must not accidentally empty the held-out pool.
  if (!/(?:model|cascade|semantic-review|manual-review|risk|quality)/i.test(file)) continue;
  const value = readJson(path.join(reportsDir, file));
  const candidates = Array.isArray(value?.results) ? value.results
    : Array.isArray(value?.reviews) ? value.reviews
      : Array.isArray(value?.rows) ? value.rows
        : Array.isArray(value?.papers) ? value.papers.flatMap((p) => p.rows ?? [])
          : [];
  for (const row of candidates) if (typeof row.source === "string" && row.source.trim()) excluded.add(stableHash(row.source));
}

const candidates = rows
  .map((row) => ({ ...row, sourceHash: stableHash(row.source) }))
  .filter((row) => !excluded.has(row.sourceHash));

// Round-robin by discipline and format keeps the cohort from being dominated
// by a single arXiv or cognitive-psychology slice.
const groups = new Map();
for (const row of candidates) {
  const key = `${row.discipline}|${row.formatFamily}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}
for (const group of groups.values()) group.sort((a, b) => a.sourceHash.localeCompare(b.sourceHash));
const keys = [...groups.keys()].sort();
const selected = [];
for (; selected.length < limit && keys.length;) {
  let added = false;
  for (const key of keys) {
    const row = groups.get(key)?.shift();
    if (!row) continue;
    selected.push({
      key: row.key ?? `${row.paperId}:${row.blockId}`,
      paperId: row.paperId,
      discipline: row.discipline,
      formatFamily: row.formatFamily,
      section: row.section,
      sourceHash: row.sourceHash,
      source: row.source,
    });
    added = true;
    if (selected.length >= limit) break;
  }
  if (!added) break;
}

const result = {
  version: "heldout-ordinary-cohort-v1",
  generatedAt: new Date().toISOString(),
  input: path.relative(root, input),
  selection: "ordinary-body source rows >=240 chars; source hashes found in other report artifacts excluded; deterministic discipline/format round-robin",
  candidateRows: candidates.length,
  excludedSourceHashCount: excluded.size,
  selectedRows: selected.length,
  rows: selected,
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(`wrote ${output}: selected=${selected.length}, candidates=${candidates.length}, excludedHashes=${excluded.size}`);
