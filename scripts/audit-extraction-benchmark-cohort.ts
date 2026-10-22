/** Verify source-hash and leakage-group isolation before held-out annotation. */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2); const option = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const cohortPath = path.resolve(root, option("--cohort") ?? "test-fixtures/extraction-benchmark/independent-cohort-v1.json");
const cohort = JSON.parse(fs.readFileSync(cohortPath, "utf8")) as { documents: Array<{ id: string; pdfPath: string; fileHash: string; leakageGroup: string; attributes: { publisher?: string } }> };
const digest = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const development = JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/real-papers/catalog.json"), "utf8")) as { pdfDir: string; papers: Array<{ id: string; filename: string; publisher?: string; formatFamily?: string }> };
const developmentHashes = new Map<string, string>();
const developmentPublishers = new Set(development.papers.map((paper) => paper.publisher?.trim().toLocaleLowerCase()).filter(Boolean));
for (const paper of development.papers) {
  const file = path.join(root, development.pdfDir, paper.filename);
  if (fs.existsSync(file)) developmentHashes.set(digest(file), paper.id);
}
const ids = new Set<string>(); const hashes = new Set<string>(); const groups = new Set<string>();
const rows = cohort.documents.map((document) => {
  const file = path.join(root, document.pdfPath); const actualHash = fs.existsSync(file) ? digest(file) : null;
  const issues = [
    ids.has(document.id) ? "duplicate-id" : null,
    hashes.has(document.fileHash) ? "duplicate-cohort-hash" : null,
    groups.has(document.leakageGroup) ? "duplicate-leakage-group" : null,
    !actualHash ? "missing-local-pdf" : null,
    actualHash && actualHash !== document.fileHash ? "source-hash-changed" : null,
    developmentHashes.has(document.fileHash) ? `development-hash:${developmentHashes.get(document.fileHash)}` : null,
    document.attributes.publisher && developmentPublishers.has(document.attributes.publisher.toLocaleLowerCase()) ? `development-publisher:${document.attributes.publisher}` : null,
  ].filter((issue): issue is string => Boolean(issue));
  ids.add(document.id); hashes.add(document.fileHash); groups.add(document.leakageGroup);
  return { id: document.id, hashVerified: actualHash === document.fileHash, issues };
});
const report = { generatedAt: new Date().toISOString(), cohort: path.relative(root, cohortPath), developmentHashesChecked: developmentHashes.size, candidates: rows.length, valid: rows.every((row) => row.issues.length === 0), rows };
console.log(JSON.stringify(report, null, 2));
if (!report.valid) process.exitCode = 1;
